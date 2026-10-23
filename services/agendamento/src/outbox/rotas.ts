import type { EnvelopeEvento, PayloadConsulta } from '@clinica/eventos';
import { Router } from 'express';
import { prisma } from '../db';

export const rotasEventos = Router();

// GET /eventos?limite=30 — últimos eventos da outbox, para o painel de eventos da recepção.
rotasEventos.get('/', async (req, res) => {
  const limite = Math.min(Number(req.query.limite ?? 30) || 30, 100);
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
