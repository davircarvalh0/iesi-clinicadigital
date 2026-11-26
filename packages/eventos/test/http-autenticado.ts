import { randomBytes } from 'node:crypto';
import { emitirAcesso, type Perfil } from '../src/acesso';

export function tokenTeste(perfil: Perfil = 'administrador') {
  process.env.AUTH_SECRET ??= randomBytes(32).toString('hex');
  return emitirAcesso({ id: 'usuario-teste', nome: 'Administrador', perfil, profissionalId: perfil === 'profissional' ? 'profissional-teste' : null });
}
export function fetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${tokenTeste()}`);
  return globalThis.fetch(url, { ...init, headers });
}
