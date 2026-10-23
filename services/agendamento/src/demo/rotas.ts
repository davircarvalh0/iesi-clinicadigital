import { Router } from 'express';
import type { Prisma } from '../../generated/prisma';
import { prisma } from '../db';
import { ErroHttp } from '../http/erros';

// Rotas do "modo demonstração" da tela. Não fazem parte do fluxo normal da clínica.
export const rotasDemo = Router();

// Reenvia o último evento com o mesmo id_evento, para mostrar a idempotência do consumidor.
rotasDemo.post('/reenviar-ultimo-evento', async (_req, res) => {
  const ultimo = await prisma.eventoSaida.findFirst({
    where: { duplicado: false, publicadoEm: { not: null } },
    orderBy: { criadoEm: 'desc' },
  });
  if (!ultimo) throw new ErroHttp(409, 'Nenhum evento publicado ainda');

  await prisma.eventoSaida.create({
    data: {
      idEvento: ultimo.idEvento,
      tipo: ultimo.tipo,
      envelope: ultimo.envelope as Prisma.InputJsonValue,
      duplicado: true,
    },
  });
  res.status(202).json({ idEvento: ultimo.idEvento, tipo: ultimo.tipo });
});
