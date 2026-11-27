import { criarEnvelope, idCorrelacaoConsulta, isoRecife, type PayloadConsultaConfirmada } from '@clinica/eventos';
import type { Prisma } from '../../generated/prisma';
import { registrarAtividade } from '../atividades/registro';
import { paraFormatoInternacional } from '../canais/telefone';
import { prisma } from '../db';

/** Lembretes que de fato chegaram (ou foram simulados) e podem receber resposta. */
const SITUACOES_RESPONDIVEIS = ['enviado', 'simulado', 'aceito_provedor'] as const;

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[.!\s]+$/g, '');
const CONFIRMACOES = new Set(['1', 'sim', 's', 'confirmo', 'confirmar', 'confirmado', 'confirmada', 'ok', 'vou', 'estarei la']);

/** US-30: "1", "sim", "confirmo"... ou o botão de resposta rápida com payload CONFIRMAR. */
export function ehConfirmacao(texto: string): boolean {
  const t = normalizar(texto);
  return CONFIRMACOES.has(t) || t === 'confirmar_presenca';
}

export interface RespostaRecebida {
  /** Id da mensagem no provedor (wamid): torna o webhook idempotente quando a Meta reenvia. */
  idMensagem: string;
  /** Telefone de quem respondeu, como o provedor informa (ex.: 5581900000001). Não é gravado. */
  telefone: string;
  texto: string;
  recebidaEm: Date;
}

/**
 * Liga a resposta ao lembrete da próxima consulta daquele telefone e, se for confirmação,
 * publica `consulta.confirmada` pela outbox na mesma transação.
 */
export async function receberResposta(r: RespostaRecebida) {
  return prisma.$transaction(async (tx) => {
    const repetida = await tx.respostaWhatsapp.findUnique({ where: { idMensagem: r.idMensagem } });
    if (repetida) return { resultado: repetida.resultado, idConsulta: repetida.idConsulta, duplicada: true };

    const internacional = paraFormatoInternacional(r.telefone);
    const lembrete = await tx.lembrete.findFirst({
      where: {
        telefone: { in: [internacional, internacional.slice(2)] },
        status: { in: [...SITUACOES_RESPONDIVEIS] },
        inicioConsulta: { gt: r.recebidaEm },
        consultaCanceladaEm: null,
      },
      orderBy: { inicioConsulta: 'asc' },
      select: { idConsulta: true },
    });

    let resultado: 'confirmada' | 'nao_reconhecida' | 'sem_consulta';
    if (!lembrete) resultado = 'sem_consulta';
    else if (!ehConfirmacao(r.texto)) resultado = 'nao_reconhecida';
    else resultado = 'confirmada';

    await tx.respostaWhatsapp.create({ data: { idMensagem: r.idMensagem, idConsulta: lembrete?.idConsulta ?? null, resultado, recebidaEm: r.recebidaEm } });
    if (resultado === 'confirmada') {
      await publicarConfirmacao(tx, lembrete!.idConsulta, r.recebidaEm);
      await registrarAtividade({ acao: 'lembrete.confirmado', descricao: 'Paciente confirmou presença pelo WhatsApp', idConsulta: lembrete!.idConsulta }, tx);
    } else {
      // Sem texto nem telefone na descrição (LGPD).
      const descricao = resultado === 'sem_consulta' ? 'Resposta pelo WhatsApp sem consulta futura com lembrete enviado' : 'Resposta pelo WhatsApp não reconhecida como confirmação';
      await registrarAtividade({ acao: 'lembrete.resposta_ignorada', descricao, idConsulta: lembrete?.idConsulta }, tx);
    }
    return { resultado, idConsulta: lembrete?.idConsulta ?? null, duplicada: false };
  });
}

async function publicarConfirmacao(tx: Prisma.TransactionClient, idConsulta: string, recebidaEm: Date) {
  const evento = criarEnvelope<'consulta.confirmada', PayloadConsultaConfirmada>({
    tipo: 'consulta.confirmada', origem: 'notificacao', id_correlacao: idCorrelacaoConsulta(idConsulta),
    payload: { id_consulta: idConsulta, canal: 'whatsapp', confirmada_em: isoRecife(recebidaEm) },
  });
  await tx.eventoSaida.create({ data: { idEvento: evento.id_evento, tipo: evento.tipo, envelope: evento as unknown as Prisma.InputJsonValue } });
}
