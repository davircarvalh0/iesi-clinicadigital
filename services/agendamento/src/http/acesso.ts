import type { RequestHandler, Response } from 'express';
import type { IdentidadeAcesso, Perfil } from '@clinica/eventos';

export const usuarioDe = (res: Response) => res.locals.usuario as IdentidadeAcesso;

/** Restringe a rota aos perfis informados (a autenticação já ocorreu em app.ts). */
export function permitir(...perfis: Perfil[]): RequestHandler {
  return (_req, res, next) => {
    if (!perfis.includes(usuarioDe(res).perfil)) { res.status(403).json({ erro: 'Acesso restrito.' }); return; }
    next();
  };
}

/** Equipe da clínica, ou o próprio profissional quando a rota é sobre ele (`:id`). */
export const equipeOuOProprio: RequestHandler = (req, res, next) => {
  const u = usuarioDe(res);
  if (u.perfil === 'administrador' || u.perfil === 'recepcionista' || (u.perfil === 'profissional' && u.profissionalId === String(req.params.id))) { next(); return; }
  res.status(403).json({ erro: 'Acesso restrito.' });
};
