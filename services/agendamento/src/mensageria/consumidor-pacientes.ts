import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  BINDING_PACIENTE, EXCHANGE_ERROS, EXCHANGE_EVENTOS,
  FILA_AGENDAMENTO, FILA_AGENDAMENTO_ERROS, validarPacienteAtualizado,
} from '@clinica/eventos';
import { aplicarPacienteAtualizado } from '../consultas/vinculo-paciente';

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
  } catch {
    const tentativa = Number(msg.properties.headers?.['x-tentativas'] ?? 0) + 1;
    console.error(`[agendamento] falha no vínculo de paciente (tentativa ${tentativa})`);
    if (tentativa >= 3) {
      canal.nack(msg, false, false);
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
      canal.nack(msg, false, true);
    }
  }
}

// Envia direto para a fila de erros deste serviço: a exchange de erros é fanout e copiaria para todas.
async function recusar(canal: ConfirmChannel, msg: ConsumeMessage, motivo: string): Promise<void> {
  console.warn(`[agendamento] evento de paciente recusado: ${motivo}`);
  try {
    await new Promise<void>((resolve, reject) => canal.sendToQueue(FILA_AGENDAMENTO_ERROS, msg.content, {
      ...msg.properties,
      persistent: true,
      headers: { ...msg.properties.headers, 'x-motivo': motivo },
    }, (erro) => erro ? reject(erro) : resolve()));
    canal.ack(msg);
  } catch {
    canal.nack(msg, false, true);
  }
}