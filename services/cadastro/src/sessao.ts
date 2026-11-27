import type { RequestHandler } from 'express';
import { verificarAcesso, type IdentidadeAcesso, type Perfil } from '@clinica/eventos';
import type { Prisma } from '../generated/prisma';
import { prisma } from './db';

/**
 * US-25: no Cadastro, dono das contas, o token só vale com a sessão aberta e a conta ativa.
 * Logout, troca de senha, mudança de perfil e desativação encerram a sessão na hora.
 * Agendamento e Notificação consultam o estado central antes de autorizar.
 */
export async function identificar(authorization: string | undefined): Promise<IdentidadeAcesso | null> {
  const identidade = verificarAcesso(authorization);
  if (!identidade?.sessaoId) return null;
  const sessao = await prisma.sessao.findUnique({
    where: { id: identidade.sessaoId },
    select: { usuarioId: true, expiraEm: true, encerradaEm: true, usuario: { select: { ativo: true } } },
  });
  if (!sessao || sessao.usuarioId !== identidade.id || sessao.encerradaEm || sessao.expiraEm <= new Date() || !sessao.usuario.ativo) return null;
  return identidade;
}

/** Exige sessão válida; com `perfis`, restringe a esses perfis. A identidade fica em `res.locals.usuario`. */
export function exigirSessao(perfis?: readonly Perfil[]): RequestHandler {
  return async (req, res, next) => {
    const usuario = await identificar(req.headers.authorization);
    if (!usuario) { res.status(401).json({ erro: 'Login obrigatório.' }); return; }
    if (perfis && !perfis.includes(usuario.perfil)) { res.status(403).json({ erro: 'Acesso restrito.' }); return; }
    res.locals.usuario = usuario;
    next();
  };
}

export function encerrarSessoes(tx: Prisma.TransactionClient, usuarioId: string, exceto?: string) {
  return tx.sessao.updateMany({
    where: { usuarioId, encerradaEm: null, ...(exceto ? { id: { not: exceto } } : {}) },
    data: { encerradaEm: new Date() },
  });
}
