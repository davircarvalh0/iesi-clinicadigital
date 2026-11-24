import type { ConfirmChannel } from 'amqplib';
import { EXCHANGE_EVENTOS } from '@clinica/eventos';
import { prisma } from '../db';

const TAMANHO_LOTE = 50;

/**
 * Lê periodicamente a outbox e publica no RabbitMQ os eventos ainda não publicados.
 * Retorna uma função que para o publicador.
 */
export function iniciarPublicador(canal: ConfirmChannel, intervaloMs: number): () => void {
  let rodando = false;

  const ciclo = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await publicarPendentes(canal);
    } catch (erro) {
      console.error('[outbox] falha no ciclo de publicação', erro);
    } finally {
      rodando = false;
    }
  };

  const timer = setInterval(ciclo, intervaloMs);
  return () => clearInterval(timer);
}

async function publicarPendentes(canal: ConfirmChannel): Promise<void> {
  const pendentes = await prisma.eventoSaida.findMany({
    where: { publicadoEm: null },
    orderBy: { criadoEm: 'asc' },
    take: TAMANHO_LOTE,
  });

  for (const evento of pendentes) {
    try {
      canal.publish(EXCHANGE_EVENTOS, evento.tipo, Buffer.from(JSON.stringify(evento.envelope)), {
        persistent: true,
        contentType: 'application/json',
        messageId: evento.idEvento,
        type: evento.tipo,
      });
      await canal.waitForConfirms();
      await prisma.eventoSaida.update({
        where: { id: evento.id },
        data: { publicadoEm: new Date(), tentativas: { increment: 1 }, ultimoErro: null },
      });
      console.log(`[outbox] publicado ${evento.tipo} ${evento.idEvento}${evento.duplicado ? ' (duplicado)' : ''}`);
    } catch (erro) {
      await prisma.eventoSaida.update({
        where: { id: evento.id },
        data: { tentativas: { increment: 1 }, ultimoErro: String(erro) },
      });
      // Mantém a ordem: os seguintes esperam o próximo ciclo.
      break;
    }
  }
}
