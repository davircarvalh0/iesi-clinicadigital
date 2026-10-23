import type { Channel, ConsumeMessage } from 'amqplib';
import { ehEventoConsulta, FILA_NOTIFICACAO, type EventoConsulta } from '@clinica/eventos';
import { registrarAtividade } from '../atividades/registro';
import { prisma } from '../db';
import { tratarEvento } from './tratadores';

const HEADER_TENTATIVAS = 'x-tentativas';

let canal: Channel;
let maxTentativas = 3;
let consumerTag: string | null = null;

/** Assina a fila da Notificação. Cada mensagem só recebe ack depois de processada. */
export async function iniciarConsumidor(canalRabbit: Channel, tentativas: number): Promise<void> {
  canal = canalRabbit;
  maxTentativas = tentativas;
  await retomarConsumo();
}

export async function retomarConsumo(): Promise<void> {
  if (consumerTag) return;
  const { consumerTag: tag } = await canal.consume(FILA_NOTIFICACAO, (msg) => {
    if (msg) void processar(msg);
  });
  consumerTag = tag;
  console.log(`[consumidor] assinando ${FILA_NOTIFICACAO}`);
}

/** Para de consumir sem derrubar o serviço: os eventos novos ficam esperando na fila. */
export async function pausarConsumo(): Promise<void> {
  if (!consumerTag) return;
  await canal.cancel(consumerTag);
  consumerTag = null;
  console.log('[consumidor] consumo pausado');
}

export async function estadoConsumo() {
  const fila = await canal.checkQueue(FILA_NOTIFICACAO);
  return { consumindo: consumerTag !== null, naFila: fila.messageCount };
}

async function processar(msg: ConsumeMessage): Promise<void> {
  const evento = lerEvento(msg);
  if (!evento) {
    await registrarAtividade({ acao: 'evento.rejeitado', descricao: 'Mensagem inválida enviada para a fila de erros' });
    canal.nack(msg, false, false);
    return;
  }

  try {
    const duplicado = await prisma.$transaction(async (tx) => {
      const jaProcessado = await tx.eventoProcessado.findUnique({ where: { idEvento: evento.id_evento } });
      if (jaProcessado) return true;
      await tx.eventoProcessado.create({ data: { idEvento: evento.id_evento, tipo: evento.tipo } });
      await tratarEvento(tx, evento);
      return false;
    });

    if (duplicado) {
      await registrarAtividade({
        acao: 'evento.duplicado',
        descricao: `${evento.tipo} repetido ignorado (${evento.payload.paciente.nome})`,
        idEvento: evento.id_evento,
        idConsulta: evento.payload.id_consulta,
      });
    }
    canal.ack(msg);
  } catch (erro) {
    await tratarFalha(msg, evento, erro);
  }
}

function lerEvento(msg: ConsumeMessage): EventoConsulta | null {
  try {
    const valor: unknown = JSON.parse(msg.content.toString());
    return ehEventoConsulta(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Tenta de novo republicando na própria fila; esgotadas as tentativas, manda para a fila de erros. */
async function tratarFalha(msg: ConsumeMessage, evento: EventoConsulta, erro: unknown): Promise<void> {
  const tentativa = Number(msg.properties.headers?.[HEADER_TENTATIVAS] ?? 0) + 1;
  const base = { idEvento: evento.id_evento, idConsulta: evento.payload.id_consulta };
  console.error(`[consumidor] falha ao processar ${evento.id_evento} (tentativa ${tentativa})`, erro);

  if (tentativa < maxTentativas) {
    await new Promise((r) => setTimeout(r, 1000 * tentativa));
    canal.sendToQueue(FILA_NOTIFICACAO, msg.content, {
      persistent: true,
      contentType: msg.properties.contentType,
      messageId: msg.properties.messageId,
      type: msg.properties.type,
      headers: { ...msg.properties.headers, [HEADER_TENTATIVAS]: tentativa },
    });
    canal.ack(msg);
    await registrarAtividade({ ...base, acao: 'evento.nova_tentativa', descricao: `${evento.tipo}: nova tentativa ${tentativa + 1}/${maxTentativas}` }).catch(() => {});
  } else {
    canal.nack(msg, false, false);
    await registrarAtividade({ ...base, acao: 'evento.rejeitado', descricao: `${evento.tipo} enviado para a fila de erros após ${tentativa} tentativas` }).catch(() => {});
  }
}
