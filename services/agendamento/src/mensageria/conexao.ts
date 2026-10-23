import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { EXCHANGE_EVENTOS } from '@clinica/eventos';

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

/** Canal com confirmação do broker, para só marcar a outbox depois que o evento foi aceito. */
export async function abrirCanalPublicacao(conexao: ChannelModel) {
  const canal = await conexao.createConfirmChannel();
  await canal.assertExchange(EXCHANGE_EVENTOS, 'topic', { durable: true });
  return canal;
}

export type { Channel };
