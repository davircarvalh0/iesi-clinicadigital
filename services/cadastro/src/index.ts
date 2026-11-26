import amqp, { type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { EXCHANGE_EVENTOS, EXCHANGE_ERROS, FILA_CADASTRO, FILA_CADASTRO_ERROS, BINDING_CADASTRO } from '@clinica/eventos';
import { ZodError } from 'zod';
import { criarApp } from './app';
import { prisma } from './db';
import { receberAgendamento } from './servico';
import { inicializarAdministrador } from './usuarios';

const MAX_TENTATIVAS = 3;

// Envia direto para a fila de erros deste serviço: a exchange de erros é fanout e copiaria para todas.
// A original só recebe ack depois da confirmação do broker; se a cópia falhar, ela volta para a fila.
async function enviarParaErros(canal: ConfirmChannel, msg: ConsumeMessage, motivo: string, tentativas?: number) {
  try {
    await new Promise<void>((resolve, reject) => canal.sendToQueue(FILA_CADASTRO_ERROS, msg.content, {
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
function devolverParaFila(canal: ConfirmChannel, msg: ConsumeMessage) {
  try {
    canal.nack(msg, false, true);
  } catch {
    console.error('[cadastro] canal fechado; a mensagem será reentregue pelo broker');
  }
}

// Só o código do erro: a mensagem pode conter dados do evento.
function motivoFalha(erro: unknown, tentativas: number): string {
  const { code, errorCode } = (erro ?? {}) as { code?: unknown; errorCode?: unknown };
  const codigo = code ?? errorCode;
  return `falha no processamento após ${tentativas} tentativas${typeof codigo === 'string' ? ` (${codigo})` : ''}`;
}

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
  await inicializarAdministrador();
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
      console.error('[cadastro] evento não processado; sem dados pessoais no log');
      if (erro instanceof ZodError || erro instanceof SyntaxError) {
        await enviarParaErros(consumo, msg, 'evento de agendamento inválido');
      } else if (tentativa >= MAX_TENTATIVAS) {
        await enviarParaErros(consumo, msg, motivoFalha(erro, tentativa), tentativa);
      } else {
        await new Promise((r) => setTimeout(r, 1000 * tentativa));
        try {
          await new Promise<void>((resolve, reject) => consumo.sendToQueue(FILA_CADASTRO, msg.content, {
            ...msg.properties, persistent: true, headers: { ...msg.properties.headers, 'x-tentativas': tentativa },
          }, (erro) => erro ? reject(erro) : resolve()));
          consumo.ack(msg);
        } catch { devolverParaFila(consumo, msg); }
      }
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
