import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class ErroHttp extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

export const tratarErros: ErrorRequestHandler = (erro, _req, res, _next) => {
  if (erro instanceof ZodError) {
    const motivos = [...new Set(erro.issues.map((problema) => problema.message))].join(' ');
    res.status(400).json({ erro: `Dados inválidos. ${motivos}`, detalhes: erro.issues });
    return;
  }
  if (erro?.type === 'entity.parse.failed') {
    res.status(400).json({ erro: 'JSON inválido' });
    return;
  }
  if (erro?.type === 'entity.too.large') {
    res.status(413).json({ erro: 'Dados da requisição excedem o limite.' });
    return;
  }
  if (erro instanceof ErroHttp) {
    res.status(erro.status).json({ erro: erro.message });
    return;
  }
  console.error('[agendamento] requisição falhou');
  res.status(500).json({ erro: 'Erro interno' });
};
