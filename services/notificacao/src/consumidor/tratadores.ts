import type { EventoConsulta } from '@clinica/eventos';
import type { Prisma } from '../../generated/prisma';
import * as lembretes from '../lembretes/servico';

/** Reação da Notificação a cada tipo de evento de consulta. */
export async function tratarEvento(tx: Prisma.TransactionClient, evento: EventoConsulta): Promise<void> {
  switch (evento.tipo) {
    case 'consulta.agendada':
      return lembretes.programar(tx, evento.payload, evento.id_evento);
    case 'consulta.reagendada':
      return lembretes.reprogramar(tx, evento.payload, evento.id_evento);
    case 'consulta.cancelada':
      return lembretes.cancelar(tx, evento.payload, evento.id_evento);
  }
}
