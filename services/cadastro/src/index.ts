import amqp, { type ConfirmChannel } from 'amqplib';
import { EXCHANGE_EVENTOS, EXCHANGE_ERROS, FILA_CADASTRO, FILA_CADASTRO_ERROS, BINDING_CADASTRO } from '@clinica/eventos';
import { ZodError } from 'zod';
import { criarApp } from './app';
import { prisma } from './db';
import { receberAgendamento } from './servico';

async function publicar(canal: ConfirmChannel) {
  const eventos = await prisma.eventoSaida.findMany({ where: { publicadoEm: null }, orderBy: { criadoEm: 'asc' }, take: 50 });
  for (const e of eventos) {
    await new Promise<void>((resolve, reject) => canal.publish(EXCHANGE_EVENTOS, e.tipo, Buffer.from(JSON.stringify(e.envelope)), {
      persistent: true, contentType: 'application/json', messageId: e.idEvento, type: e.tipo,
    }, (erro) => erro ? reject(erro) : resolve()));
    await prisma.eventoSaida.update({ where: { idEvento: e.idEvento }, data: { publicadoEm: new Date() } });
  }
}

async function main() {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL obrigatória');
  let conexao: Awaited<ReturnType<typeof amqp.connect>> | undefined;
  for (let tentativa = 1; !conexao; tentativa++) {
    try { conexao = await amqp.connect(url); }
    catch { if (tentativa >= 30) throw new Error('Broker indisponível'); await new Promise((r) => setTimeout(r, 2000)); }
  }
  let encerrando = false;
  conexao.on('error', () => console.error('[cadastro] falha no broker'));
  conexao.on('close', () => { if (!encerrando) process.exit(1); });
  const canal = await conexao.createConfirmChannel();
  const consumo = await conexao.createConfirmChannel();
  await canal.assertExchange(EXCHANGE_EVENTOS, 'topic', { durable: true });
  await consumo.assertExchange(EXCHANGE_ERROS, 'fanout', { durable: true });
  await consumo.assertQueue(FILA_CADASTRO, { durable: true, arguments: { 'x-dead-letter-exchange': EXCHANGE_ERROS } });
  await consumo.assertQueue(FILA_CADASTRO_ERROS, { durable: true });
  await consumo.bindQueue(FILA_CADASTRO, EXCHANGE_EVENTOS, BINDING_CADASTRO);
  await consumo.bindQueue(FILA_CADASTRO_ERROS, EXCHANGE_ERROS, '');
  await consumo.prefetch(1);
  await consumo.consume(FILA_CADASTRO, async (msg) => {
    if (!msg) return;
    try {
      await receberAgendamento(JSON.parse(msg.content.toString()));
      consumo.ack(msg);
    } catch (erro) {
      const tentativa = Number(msg.properties.headers?.['x-tentativas'] ?? 0) + 1;
      if (erro instanceof ZodError || erro instanceof SyntaxError || tentativa >= 3) {
        consumo.nack(msg, false, false);
      } else {
        await new Promise((r) => setTimeout(r, 1000 * tentativa));
        try {
          await new Promise<void>((resolve, reject) => consumo.sendToQueue(FILA_CADASTRO, msg.content, {
            ...msg.properties, persistent: true, headers: { ...msg.properties.headers, 'x-tentativas': tentativa },
          }, (erro) => erro ? reject(erro) : resolve()));
          consumo.ack(msg);
        } catch { consumo.nack(msg, false, true); }
      }
      console.error('[cadastro] evento não processado; sem dados pessoais no log');
    }
  });
  let publicando = false;
  const timer = setInterval(async () => {
    if (publicando) return;
    publicando = true;
    try { await publicar(canal); } catch { console.error('[cadastro] publicação pendente; nova tentativa no próximo ciclo'); }
    finally { publicando = false; }
  }, 1000);
  const servidor = criarApp().listen(Number(process.env.PORTA ?? 3003));
  const encerrar = async () => {
    encerrando = true; clearInterval(timer); servidor.close();
    await conexao.close().catch(() => {}); await prisma.$disconnect(); process.exit(0);
  };
  process.on('SIGINT', encerrar); process.on('SIGTERM', encerrar);
}

main().catch(() => { console.error('[cadastro] falha ao iniciar'); process.exit(1); });
