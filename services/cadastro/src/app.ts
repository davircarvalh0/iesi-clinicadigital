import express, { type ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { atualizar, buscarPorCpf, ErroCadastro, listar } from './servico';

export function criarApp() {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.get('/saude', (_req, res) => res.json({ servico: 'cadastro', status: 'ok' }));
  app.get('/pacientes', async (req, res) => { res.json(await listar(req.query)); });
  app.post('/pacientes/busca-cpf', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ paciente: await buscarPorCpf(req.body) });
  });
  app.patch('/pacientes/:id', async (req, res) => { res.json(await atualizar(req.params.id, req.body)); });
  const erros: ErrorRequestHandler = (erro, _req, res, _next) => {
    if (erro instanceof ZodError) { res.status(400).json({ erro: 'Contato ou busca inválidos. Confira os campos.' }); return; }
    if (erro instanceof ErroCadastro) { res.status(erro.status).json({ erro: erro.message }); return; }
    if (erro?.type === 'entity.parse.failed') { res.status(400).json({ erro: 'JSON inválido' }); return; }
    // Não registra corpo, CPF, telefone, e-mail ou mensagens do driver.
    console.error('[cadastro] requisição falhou');
    res.status(503).json({ erro: 'Cadastro indisponível. Tente novamente.' });
  };
  app.use(erros);
  return app;
}
