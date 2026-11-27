import express from 'express';
import { prisma } from './db';
import { exigirSessao } from './sessao';

// Processo de identidade do domínio Cadastro, isolado do consumidor e da API cadastral.
const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/saude', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.sendStatus(204); }
  catch { res.sendStatus(503); }
});
app.get('/usuarios/sessao', exigirSessao(), (_req, res) => { res.sendStatus(204); });
app.listen(3010);
