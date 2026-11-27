import type { ChannelModel, ConfirmChannel } from 'amqplib';
import { EXCHANGE_EVENTOS } from '@clinica/eventos';
import { prisma } from '../db';

/** US-30: publica a outbox da Notificação (hoje, só `consulta.confirmada`). Volta a tentar no próximo ciclo. */
async function publicar(canal: ConfirmChannel) {
  const eventos = await prisma.eventoSaida.findMany({ where: { publicadoEm: null }, orderBy: { criadoEm: 'asc' }, take: 50 });
  for (const e of eventos) {
    await new Promise<void>((resolve, reject) => canal.publish(EXCHANGE_EVENTOS, e.tipo, Buffer.from(JSON.stringify(e.envelope)), {
      persistent: true, contentType: 'application/json', messageId: e.idEvento, type: e.tipo,
    }, (erro) => (erro ? reject(erro) : resolve())));
    await prisma.eventoSaida.update({ where: { idEvento: e.idEvento }, data: { publicadoEm: new Date() } });
  }
}

export async function iniciarPublicador(conexao: ChannelModel, intervaloMs = 1000) {
  const canal = await conexao.createConfirmChannel();
  await canal.assertExchange(EXCHANGE_EVENTOS, 'topic', { durable: true });
  let publicando = false;
  const timer = setInterval(async () => {
    if (publicando) return;
    publicando = true;
    try { await publicar(canal); } catch { console.error('[notificacao] publicação pendente; nova tentativa no próximo ciclo'); }
    finally { publicando = false; }
  }, intervaloMs);
  return () => clearInterval(timer);
}
