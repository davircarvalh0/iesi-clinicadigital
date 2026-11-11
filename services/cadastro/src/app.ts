import express, { type ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { atualizar, buscarPorCpf, detalhar, ErroCadastro, listar } from './servico';

export function criarApp() {
  const app = express();
  app.use('/pacientes', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '16kb' }));
  app.get('/saude', (_req, res) => res.json({ servico: 'cadastro', status: 'ok' }));
  app.get('/pacientes', async (req, res) => { res.json(await listar(req.query)); });
  app.post('/pacientes/busca-cpf', async (req, res) => {
    res.json({ paciente: await buscarPorCpf(req.body) });
  });
  app.get('/pacientes/:id', async (req, res) => { res.json(await detalhar(req.params.id)); });
  app.patch('/pacientes/:id', async (req, res) => { res.json(await atualizar(req.params.id, req.body)); });
  const erros: ErrorRequestHandler = (erro, _req, res, _next) => {
    if (erro instanceof ZodError) { res.status(400).json({ erro: 'Dados de cadastro ou busca inválidos. Confira os campos.' }); return; }
    if (erro instanceof ErroCadastro) { res.status(erro.status).json({ erro: erro.message }); return; }
    if (erro?.type === 'entity.parse.failed') { res.status(400).json({ erro: 'JSON inválido' }); return; }
    if (erro?.type === 'entity.too.large') { res.status(413).json({ erro: 'Dados da requisição excedem o limite.' }); return; }
    // Não registra corpo, CPF, telefone, e-mail ou mensagens do driver.
    console.error('[cadastro] requisição falhou');
    res.status(503).json({ erro: 'Cadastro indisponível. Tente novamente.' });
  };
  app.use(erros);
  return app;
}
