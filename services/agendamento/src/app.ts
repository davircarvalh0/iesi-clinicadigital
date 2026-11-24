import express from 'express';
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
  app.use('/consultas', rotasConsultas);
  app.use('/eventos', rotasEventos);
  app.use('/demo', rotasDemo);

  app.use(tratarErros);
  return app;
}
