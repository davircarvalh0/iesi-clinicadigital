import { Router } from 'express';
import { prisma } from '../db';

export const rotasAtividades = Router();

// GET /atividades?limite=30
rotasAtividades.get('/', async (req, res) => {
  const limite = Math.min(Number(req.query.limite ?? 30) || 30, 100);
  res.json(await prisma.atividade.findMany({ orderBy: { ocorridoEm: 'desc' }, take: limite }));
});
