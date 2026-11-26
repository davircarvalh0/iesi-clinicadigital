import express from 'express';
import { verificarAcesso } from '@clinica/eventos';
import { z } from 'zod';
import { prisma } from './db';
import { rotasConsultas } from './consultas/rotas';
import { rotasDemo } from './demo/rotas';
import { tratarErros } from './http/erros';
import { rotasEventos } from './outbox/rotas';

export function criarApp() {
  const app = express();
  app.use(express.json());

  app.get('/saude', (_req, res) => {
    res.json({ servico: 'agendamento', status: 'ok' });
  });
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const usuario = verificarAcesso(req.headers.authorization);
    if (!usuario) { res.status(401).json({ erro: 'Login obrigatório.' }); return; }
    res.locals.usuario = usuario;
    if (usuario.perfil === 'profissional' && !(req.method === 'GET' && req.path === '/consultas')) { res.status(403).json({ erro: 'Acesso restrito.' }); return; }
    next();
  });
  app.get('/profissionais', async (_req, res) => { res.json(await prisma.profissional.findMany({ orderBy: { nome: 'asc' } })); });
  app.post('/profissionais', async (req, res) => {
    if (res.locals.usuario.perfil !== 'administrador') { res.status(403).json({ erro: 'Acesso restrito.' }); return; }
    const dados = z.object({ nome: z.string().trim().min(3).max(120), especialidade: z.string().trim().min(2).max(120) }).parse(req.body);
    try { res.status(201).json(await prisma.profissional.create({ data: dados })); }
    catch (erro) { if ((erro as { code?: string }).code === 'P2002') { res.status(409).json({ erro: 'Profissional já cadastrado.' }); return; } throw erro; }
  });
  app.use('/consultas', rotasConsultas);
  app.use('/eventos', rotasEventos);
  if (process.env.TEST_CONTROLS === 'true') app.use('/demo', (req, res, next) => {
    if (res.locals.usuario.perfil !== 'administrador') { res.sendStatus(403); return; } next();
  }, rotasDemo);

  app.use(tratarErros);
  return app;
}
