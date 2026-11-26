import type { ChannelModel, GetMessage } from 'amqplib';
import { ehObjeto, FILA_NOTIFICACAO, FILA_NOTIFICACAO_ERROS } from '@clinica/eventos';
import { mascararDados } from '../atividades/registro';
import { ErroHttp } from '../http/erros';

const HEADER_TENTATIVAS = 'x-tentativas';
const HEADER_MOTIVO = 'x-motivo';
const HEADER_REPROCESSAMENTO = 'x-reprocessamento';
const LIMITE_BUSCA = 1000;

/** O que a operação enxerga de uma mensagem em erro: identificadores e motivo, nunca o payload. */
export interface MensagemEmErro {
  idEvento: string | null;
  tipo: string | null;
  versao: number | null;
  origem: string | null;
  idCorrelacao: string | null;
  idConsulta: string | null;
  ocorridoEm: string | null;
  tentativas: number;
  motivo: string;
  /** Sem `id_evento` legível não há como pedir o reprocessamento por identificador. */
  reprocessavel: boolean;
}

let conexao: ChannelModel | null = null;

export function iniciarFilaErros(conexaoRabbit: ChannelModel): void {
  conexao = conexaoRabbit;
}

const identificador = (v: unknown) => (typeof v === 'string' && v.trim() ? v.slice(0, 100) : null);
// Texto livre vindo da mensagem passa pelo mascaramento de dados pessoais (US-16).
const textoSeguro = (v: unknown) => (typeof v === 'string' && v.trim() ? mascararDados(v.slice(0, 100)) : null);

/** Extrai só campos de controle da mensagem. Conteúdo do payload (paciente, telefone, CPF) fica de fora. */
export function resumirMensagem(msg: Pick<GetMessage, 'content' | 'properties'>): MensagemEmErro {
  let valor: unknown;
  try {
    valor = JSON.parse(msg.content.toString());
  } catch {
    valor = null;
  }
  const envelope = ehObjeto(valor) ? valor : {};
  const payload = ehObjeto(envelope.payload) ? envelope.payload : {};
  const headers = msg.properties.headers ?? {};
  const tentativas = Number(headers[HEADER_TENTATIVAS] ?? 0);
  const idEvento = identificador(envelope.id_evento);
  return {
    idEvento,
    tipo: textoSeguro(envelope.tipo),
    versao: typeof envelope.versao === 'number' ? envelope.versao : null,
    origem: textoSeguro(envelope.origem),
    idCorrelacao: identificador(envelope.id_correlacao),
    idConsulta: identificador(payload.id_consulta),
    ocorridoEm: identificador(envelope.ocorrido_em),
    tentativas: Number.isFinite(tentativas) ? tentativas : 0,
    motivo: textoSeguro(headers[HEADER_MOTIVO]) ?? '',
    reprocessavel: idEvento !== null,
  };
}

// Uma operação por vez: mensagens lidas e ainda sem ack ficam invisíveis para as demais leituras.
let fila: Promise<unknown> = Promise.resolve();
function exclusivo<T>(tarefa: () => Promise<T>): Promise<T> {
  const execucao = fila.then(tarefa, tarefa);
  fila = execucao.catch(() => {});
  return execucao;
}

function exigirConexao(): ChannelModel {
  if (!conexao) throw new ErroHttp(503, 'Fila de erros indisponível. Tente novamente.');
  return conexao;
}

/** Lê sem consumir: as mensagens não recebem ack e voltam à fila de erros quando o canal fecha. */
export function listarMensagensEmErro(limite: number): Promise<MensagemEmErro[]> {
  return exclusivo(async () => {
    const canal = await exigirConexao().createChannel();
    try {
      const mensagens: MensagemEmErro[] = [];
      while (mensagens.length < limite) {
        const msg = await canal.get(FILA_NOTIFICACAO_ERROS, { noAck: false });
        if (!msg) break;
        mensagens.push(resumirMensagem(msg));
      }
      return mensagens;
    } finally {
      await canal.close().catch(() => {});
    }
  });
}

export type ResultadoRepublicacao =
  | { localizada: false }
  | { localizada: true; resumo: MensagemEmErro; republicada: boolean };

/**
 * Republica na fila da Notificação a mensagem com o `id_evento` informado, com o mesmo conteúdo.
 * A original só recebe ack depois da confirmação do broker. Se a republicação falhar, ela continua na fila de erros.
 * O contador `x-tentativas` recomeça, para que o reprocessamento tenha todas as tentativas do consumidor.
 */
export function republicarMensagem(
  idEvento: string,
  idReprocessamento: string,
  antesDeRepublicar: (resumo: MensagemEmErro) => Promise<void>,
): Promise<ResultadoRepublicacao> {
  return exclusivo(async () => {
    const leitura = await exigirConexao().createChannel();
    const publicacao = await exigirConexao().createConfirmChannel();
    try {
      for (let lidas = 0; lidas < LIMITE_BUSCA; lidas++) {
        const msg = await leitura.get(FILA_NOTIFICACAO_ERROS, { noAck: false });
        if (!msg) break;
        const resumo = resumirMensagem(msg);
        if (resumo.idEvento !== idEvento) continue;

        await antesDeRepublicar(resumo);
        const { [HEADER_MOTIVO]: _motivo, [HEADER_TENTATIVAS]: _tentativas, ...headers } = msg.properties.headers ?? {};
        try {
          await new Promise<void>((resolve, reject) => publicacao.sendToQueue(FILA_NOTIFICACAO, msg.content, {
            persistent: true,
            contentType: msg.properties.contentType,
            messageId: msg.properties.messageId,
            type: msg.properties.type,
            headers: { ...headers, [HEADER_REPROCESSAMENTO]: idReprocessamento },
          }, (erro) => erro ? reject(erro) : resolve()));
        } catch {
          return { localizada: true, resumo, republicada: false };
        }
        leitura.ack(msg);
        return { localizada: true, resumo, republicada: true };
      }
      return { localizada: false };
    } finally {
      await publicacao.close().catch(() => {});
      await leitura.close().catch(() => {});
    }
  });
}
