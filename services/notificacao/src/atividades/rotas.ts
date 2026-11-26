import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';

export const rotasAtividades = Router();

// Limite inteiro a partir de 1 (padrão 30); acima de 100 é reduzido a 100. Valor inválido responde 400.
const esquemaLimite = z.object({
  limite: z.coerce.number('Limite inválido. Informe um inteiro a partir de 1.')
    .int('Limite inválido. Informe um inteiro a partir de 1.')
    .min(1, 'Limite inválido. Informe um inteiro a partir de 1.')
    .transform((v) => Math.min(v, 100)).default(30),
});

// GET /atividades?limite=30
rotasAtividades.get('/', async (req, res) => {
  const { limite } = esquemaLimite.parse(req.query);
  res.json(await prisma.atividade.findMany({ orderBy: { ocorridoEm: 'desc' }, take: limite }));
});
