import express from 'express';
import { verificarSessaoRemota, type IdentidadeAcesso } from '@clinica/eventos';
import { rotasConsultas, rotasPortal } from './consultas/rotas';
import { rotasDemo } from './demo/rotas';
import { permitir } from './http/acesso';
import { tratarErros } from './http/erros';
import { rotasIndicadores } from './indicadores/rotas';
import { rotasEventos } from './outbox/rotas';
import { rotasProfissionais } from './profissionais/rotas';

export function criarApp(identificar: (authorization: string | undefined) => IdentidadeAcesso | null | Promise<IdentidadeAcesso | null> = verificarSessaoRemota) {
  const app = express();
  app.use(express.json());

  app.get('/saude', (_req, res) => {
    res.json({ servico: 'agendamento', status: 'ok' });
  });
  // Autenticação aqui; cada rota declara os perfis que aceita (http/acesso.ts).
  app.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let usuario: IdentidadeAcesso | null;
    try { usuario = await identificar(req.headers.authorization); }
    catch { res.status(503).json({ erro: 'Validação de sessão indisponível.' }); return; }
    if (!usuario) { res.status(401).json({ erro: 'Login obrigatório.' }); return; }
    res.locals.usuario = usuario;
    next();
  });
  app.use('/profissionais', rotasProfissionais);
  app.use('/consultas', rotasConsultas);
  app.use('/pacientes', rotasPortal);
  app.use('/indicadores', rotasIndicadores);
  app.use('/eventos', permitir('administrador', 'recepcionista'), rotasEventos);
  if (process.env.TEST_CONTROLS === 'true') app.use('/demo', permitir('administrador'), rotasDemo);

  app.use(tratarErros);
  return app;
}
