import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  BINDING_PACIENTE, EXCHANGE_ERROS, EXCHANGE_EVENTOS,
  FILA_AGENDAMENTO, FILA_AGENDAMENTO_ERROS, validarPacienteAtualizado,
} from '@clinica/eventos';
import { aplicarPacienteAtualizado } from '../consultas/vinculo-paciente';

const MAX_TENTATIVAS = 3;

export async function iniciarConsumidorPacientes(canal: ConfirmChannel): Promise<void> {
  await canal.assertExchange(EXCHANGE_EVENTOS, 'topic', { durable: true });
  await canal.assertExchange(EXCHANGE_ERROS, 'fanout', { durable: true });
  await canal.assertQueue(FILA_AGENDAMENTO, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': EXCHANGE_ERROS },
  });
  await canal.assertQueue(FILA_AGENDAMENTO_ERROS, { durable: true });
  await canal.bindQueue(FILA_AGENDAMENTO, EXCHANGE_EVENTOS, BINDING_PACIENTE);
  await canal.bindQueue(FILA_AGENDAMENTO_ERROS, EXCHANGE_ERROS, '');
  await canal.prefetch(1);
  await canal.consume(FILA_AGENDAMENTO, (msg) => {
    if (msg) void consumir(canal, msg);
  });
}

function lerEvento(msg: ConsumeMessage): unknown {
  try {
    return JSON.parse(msg.content.toString());
  } catch {
    return null;
  }
}

async function consumir(canal: ConfirmChannel, msg: ConsumeMessage): Promise<void> {
  const leitura = validarPacienteAtualizado(lerEvento(msg));
  if (!leitura.ok) {
    await recusar(canal, msg, leitura.motivo);
    return;
  }
  const evento = leitura.evento;

  try {
    await aplicarPacienteAtualizado(evento);
    canal.ack(msg);
  } catch (erro) {
    const tentativa = Number(msg.properties.headers?.['x-tentativas'] ?? 0) + 1;
    console.error(`[agendamento] falha no vínculo de paciente (tentativa ${tentativa})`);
    if (tentativa >= MAX_TENTATIVAS) {
      await enviarParaErros(canal, msg, motivoFalha(erro, tentativa), tentativa);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000 * tentativa));
    try {
      await new Promise<void>((resolve, reject) => canal.sendToQueue(FILA_AGENDAMENTO, msg.content, {
        ...msg.properties, persistent: true,
        headers: { ...msg.properties.headers, 'x-tentativas': tentativa },
      }, (erro) => erro ? reject(erro) : resolve()));
      canal.ack(msg);
    } catch {
      devolverParaFila(canal, msg);
    }
  }
}

async function recusar(canal: ConfirmChannel, msg: ConsumeMessage, motivo: string): Promise<void> {
  console.warn(`[agendamento] evento de paciente recusado: ${motivo}`);
  await enviarParaErros(canal, msg, motivo);
}

// Envia direto para a fila de erros deste serviço: a exchange de erros é fanout e copiaria para todas.
// A original só recebe ack depois da confirmação do broker; se a cópia falhar, ela volta para a fila.
async function enviarParaErros(canal: ConfirmChannel, msg: ConsumeMessage, motivo: string, tentativas?: number): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => canal.sendToQueue(FILA_AGENDAMENTO_ERROS, msg.content, {
      ...msg.properties,
      persistent: true,
      headers: {
        ...msg.properties.headers,
        'x-motivo': motivo,
        ...(tentativas === undefined ? {} : { 'x-tentativas': tentativas }),
      },
    }, (erro) => erro ? reject(erro) : resolve()));
    canal.ack(msg);
  } catch {
    devolverParaFila(canal, msg);
  }
}

// Com o canal fechado não há como dar nack; a mensagem volta sozinha quando a conexão cai.
function devolverParaFila(canal: ConfirmChannel, msg: ConsumeMessage): void {
  try {
    canal.nack(msg, false, true);
  } catch {
    console.error('[agendamento] canal fechado; a mensagem será reentregue pelo broker');
  }
}

// Só o código do erro: a mensagem pode conter dados do evento.
function motivoFalha(erro: unknown, tentativas: number): string {
  const { code, errorCode } = (erro ?? {}) as { code?: unknown; errorCode?: unknown };
  const codigo = code ?? errorCode;
  return `falha no processamento após ${tentativas} tentativas${typeof codigo === 'string' ? ` (${codigo})` : ''}`;
}
