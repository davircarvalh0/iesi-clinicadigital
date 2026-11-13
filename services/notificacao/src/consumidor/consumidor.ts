import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  FILA_NOTIFICACAO, FILA_NOTIFICACAO_ERROS, validarEventoConsulta, validarPacienteAtualizado,
  type EventoConsulta, type PacienteAtualizado, type Validacao,
} from '@clinica/eventos';
import { registrarAtividade } from '../atividades/registro';
import { prisma } from '../db';
import { tratarEvento } from './tratadores';

const HEADER_TENTATIVAS = 'x-tentativas';
const HEADER_MOTIVO = 'x-motivo';

let canal: ConfirmChannel;
let maxTentativas = 3;
let consumerTag: string | null = null;

/** Assina a fila da Notificação. Cada mensagem só recebe ack depois de processada. */
export async function iniciarConsumidor(canalRabbit: ConfirmChannel, tentativas: number): Promise<void> {
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
  const leitura = lerEvento(msg);
  if (!leitura.ok) {
    await recusar(msg, leitura.motivo);
    return;
  }
  const evento = leitura.evento;

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
        descricao: `${evento.tipo} repetido ignorado`,
        idEvento: evento.id_evento,
        idConsulta: evento.tipo === 'paciente.atualizado' ? undefined : evento.payload.id_consulta,
      });
    }
    canal.ack(msg);
  } catch (erro) {
    await tratarFalha(msg, evento, erro);
  }
}

function lerEvento(msg: ConsumeMessage): Validacao<EventoConsulta | PacienteAtualizado> {
  let valor: unknown;
  try {
    valor = JSON.parse(msg.content.toString());
  } catch {
    return { ok: false, motivo: 'mensagem não é JSON válido' };
  }
  const tipo = (valor as { tipo?: unknown } | null)?.tipo;
  return tipo === 'paciente.atualizado' ? validarPacienteAtualizado(valor) : validarEventoConsulta(valor);
}

// Envia direto para a fila de erros deste serviço: a exchange de erros é fanout e copiaria para todas.
async function recusar(msg: ConsumeMessage, motivo: string): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => canal.sendToQueue(FILA_NOTIFICACAO_ERROS, msg.content, {
      persistent: true,
      contentType: msg.properties.contentType,
      messageId: msg.properties.messageId,
      type: msg.properties.type,
      headers: { ...msg.properties.headers, [HEADER_MOTIVO]: motivo },
    }, (erro) => erro ? reject(erro) : resolve()));
    canal.ack(msg);
  } catch {
    canal.nack(msg, false, true);
    return;
  }
  const idEvento = lerIdEvento(msg);
  await registrarAtividade({ acao: 'evento.rejeitado', descricao: `Evento recusado: ${motivo}`, idEvento }).catch(() => {});
}

function lerIdEvento(msg: ConsumeMessage): string | undefined {
  try {
    const id = (JSON.parse(msg.content.toString()) as { id_evento?: unknown }).id_evento;
    return typeof id === 'string' && id ? id : undefined;
  } catch {
    return undefined;
  }
}

/** Tenta de novo republicando na própria fila; esgotadas as tentativas, manda para a fila de erros. */
async function tratarFalha(msg: ConsumeMessage, evento: EventoConsulta | PacienteAtualizado, _erro: unknown): Promise<void> {
  const tentativa = Number(msg.properties.headers?.[HEADER_TENTATIVAS] ?? 0) + 1;
  const base = { idEvento: evento.id_evento, idConsulta: evento.tipo === 'paciente.atualizado' ? undefined : evento.payload.id_consulta };
  console.error(`[consumidor] falha ao processar ${evento.id_evento} (tentativa ${tentativa})`);

  if (tentativa < maxTentativas) {
    await new Promise((r) => setTimeout(r, 1000 * tentativa));
    try {
      await new Promise<void>((resolve, reject) => canal.sendToQueue(FILA_NOTIFICACAO, msg.content, {
        persistent: true,
        contentType: msg.properties.contentType,
        messageId: msg.properties.messageId,
        type: msg.properties.type,
        headers: { ...msg.properties.headers, [HEADER_TENTATIVAS]: tentativa },
      }, (erro) => erro ? reject(erro) : resolve()));
      canal.ack(msg);
    } catch { canal.nack(msg, false, true); return; }
    await registrarAtividade({ ...base, acao: 'evento.nova_tentativa', descricao: `${evento.tipo}: nova tentativa ${tentativa + 1}/${maxTentativas}` }).catch(() => {});
  } else {
    canal.nack(msg, false, false);
    await registrarAtividade({ ...base, acao: 'evento.rejeitado', descricao: `${evento.tipo} enviado para a fila de erros após ${tentativa} tentativas` }).catch(() => {});
  }
}