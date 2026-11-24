import type { EnvelopeEvento, PayloadConsulta } from '@clinica/eventos';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';

export const rotasEventos = Router();

// Limite inteiro a partir de 1 (padrão 30); acima de 100 é reduzido a 100. Valor inválido responde 400.
const esquemaLimite = z.object({
  limite: z.coerce.number('Limite inválido. Informe um inteiro a partir de 1.')
    .int('Limite inválido. Informe um inteiro a partir de 1.')
    .min(1, 'Limite inválido. Informe um inteiro a partir de 1.')
    .transform((v) => Math.min(v, 100)).default(30),
});

// GET /eventos?limite=30 — últimos eventos da outbox, para o painel de eventos da recepção.
rotasEventos.get('/', async (req, res) => {
  const { limite } = esquemaLimite.parse(req.query);
  const linhas = await prisma.eventoSaida.findMany({ orderBy: { criadoEm: 'desc' }, take: limite });

  res.json(
    linhas.map((l) => {
      const envelope = l.envelope as unknown as EnvelopeEvento<string, PayloadConsulta>;
      return {
        id: l.id,
        idEvento: l.idEvento,
        tipo: l.tipo,
        duplicado: l.duplicado,
        criadoEm: l.criadoEm,
        publicadoEm: l.publicadoEm,
        idConsulta: envelope.payload.id_consulta,
        pacienteNome: envelope.payload.paciente.nome,
        inicio: envelope.payload.inicio,
      };
    }),
  );
});
