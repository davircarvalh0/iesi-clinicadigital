import express from 'express';
import { verificarAcesso } from '@clinica/eventos';
import { rotasAtividades } from './atividades/rotas';
import { rotasAutorizacoes } from './autorizacoes/rotas';
import { rotasDemo } from './demo/rotas';
import { rotasEnvio } from './envio/rotas';
import { tratarErros } from './http/erros';
import { rotasLembretes } from './lembretes/rotas';
import { rotasOperacao } from './reprocessamento/rotas';

export function criarApp() {
  const app = express();
  app.use(express.json());

  app.get('/saude', (_req, res) => {
    res.json({ servico: 'notificacao', status: 'ok' });
  });
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const usuario = verificarAcesso(req.headers.authorization);
    if (!usuario) { res.status(401).json({ erro: 'Login obrigatório.' }); return; }
    if (usuario.perfil === 'profissional') { res.status(403).json({ erro: 'Acesso restrito.' }); return; }
    res.locals.usuario = usuario;
    next();
  });
  app.use('/lembretes', rotasLembretes);
  app.use('/envio', rotasEnvio);
  app.use('/atividades', rotasAtividades);
  app.use('/autorizacoes', rotasAutorizacoes);
  app.use('/operacao', (_req, res, next) => {
    if (res.locals.usuario.perfil !== 'administrador') { res.status(403).json({ erro: 'Acesso restrito.' }); return; } next();
  }, rotasOperacao);
  if (process.env.TEST_CONTROLS === 'true') app.use('/demo', (req, res, next) => {
    if (res.locals.usuario.perfil !== 'administrador') { res.sendStatus(403); return; } next();
  }, rotasDemo);

  app.use(tratarErros);
  return app;
}
