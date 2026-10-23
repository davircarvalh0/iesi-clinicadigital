import express from 'express';
import { rotasAtividades } from './atividades/rotas';
import { rotasDemo } from './demo/rotas';
import { tratarErros } from './http/erros';
import { rotasLembretes } from './lembretes/rotas';

export function criarApp() {
  const app = express();
  app.use(express.json());

  app.get('/saude', (_req, res) => {
    res.json({ servico: 'notificacao', status: 'ok' });
  });
  app.use('/lembretes', rotasLembretes);
  app.use('/atividades', rotasAtividades);
  app.use('/demo', rotasDemo);

  app.use(tratarErros);
  return app;
}
