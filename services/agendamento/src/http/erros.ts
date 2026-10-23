import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class ErroHttp extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

export const tratarErros: ErrorRequestHandler = (erro, _req, res, _next) => {
  if (erro instanceof ZodError) {
    res.status(400).json({ erro: 'Dados inválidos', detalhes: erro.issues });
    return;
  }
  if (erro instanceof ErroHttp) {
    res.status(erro.status).json({ erro: erro.message });
    return;
  }
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno' });
};
