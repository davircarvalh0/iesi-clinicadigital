import amqp, { type ChannelModel } from 'amqplib';
import {
  BINDING_NOTIFICACAO,
  EXCHANGE_ERROS,
  EXCHANGE_EVENTOS,
  FILA_NOTIFICACAO,
  FILA_NOTIFICACAO_ERROS,
} from '@clinica/eventos';

/** Conecta ao RabbitMQ tentando de novo enquanto o broker ainda está subindo. */
export async function conectarRabbit(url: string, tentativas = 30): Promise<ChannelModel> {
  for (let i = 1; ; i++) {
    try {
      return await amqp.connect(url);
    } catch (erro) {
      if (i >= tentativas) throw erro;
      console.warn(`[rabbit] indisponível (tentativa ${i}/${tentativas}), aguardando...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Garante a fila da Notificação e sua fila de erros (mesmos argumentos de infra/rabbitmq/definitions.json). */
export async function abrirCanalConsumo(conexao: ChannelModel) {
  const canal = await conexao.createChannel();
  await canal.assertExchange(EXCHANGE_EVENTOS, 'topic', { durable: true });
  await canal.assertExchange(EXCHANGE_ERROS, 'fanout', { durable: true });
  await canal.assertQueue(FILA_NOTIFICACAO, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': EXCHANGE_ERROS },
  });
  await canal.assertQueue(FILA_NOTIFICACAO_ERROS, { durable: true });
  await canal.bindQueue(FILA_NOTIFICACAO, EXCHANGE_EVENTOS, BINDING_NOTIFICACAO);
  await canal.bindQueue(FILA_NOTIFICACAO_ERROS, EXCHANGE_ERROS, '');
  await canal.prefetch(1);
  return canal;
}
