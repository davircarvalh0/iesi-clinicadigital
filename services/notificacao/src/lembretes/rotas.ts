import { Router } from 'express';
import { listarLembretes } from './servico';

export const rotasLembretes = Router();

// GET /lembretes?consulta=<id_consulta>
rotasLembretes.get('/', async (req, res) => {
  const idConsulta = typeof req.query.consulta === 'string' ? req.query.consulta : undefined;
  res.json(await listarLembretes({ idConsulta }));
});
