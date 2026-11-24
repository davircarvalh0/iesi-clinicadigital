import express from 'express';
import { rotasAtividades } from './atividades/rotas';
import { rotasAutorizacoes } from './autorizacoes/rotas';
import { config } from './config';
import { rotasDemo } from './demo/rotas';
import { tratarErros } from './http/erros';
import { rotasLembretes } from './lembretes/rotas';
import { rotasOperacao } from './reprocessamento/rotas';

export function criarApp() {
  const app = express();
  app.use(express.json());

  app.get('/saude', (_req, res) => {
    res.json({ servico: 'notificacao', status: 'ok' });
  });
  app.use('/lembretes', rotasLembretes);
  app.use('/atividades', rotasAtividades);
  app.use('/autorizacoes', rotasAutorizacoes);
  app.use('/demo', rotasDemo);
  if (config.operacaoHabilitada) app.use('/operacao', rotasOperacao);

  app.use(tratarErros);
  return app;
}
