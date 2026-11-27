import { randomBytes, randomUUID } from 'node:crypto';
import { DURACAO_ACESSO_MS, emitirAcesso } from '@clinica/eventos';
import { prisma } from '../src/db';

// US-25: o Cadastro exige sessão aberta no banco. Os testes de banco criam um administrador
// fictício e uma sessão reais no banco de teste, sem atalho de autorização.
let token: Promise<string> | undefined;
async function abrirSessao() {
  process.env.AUTH_SECRET ??= randomBytes(32).toString('hex');
  const usuario = await prisma.usuario.create({
    data: { nome: 'Administrador de teste', email: `${randomUUID()}@teste.invalid`, perfil: 'administrador', senhaHash: 'sem-login' },
  });
  const sessao = await prisma.sessao.create({ data: { usuarioId: usuario.id, expiraEm: new Date(Date.now() + DURACAO_ACESSO_MS) } });
  return emitirAcesso({ id: usuario.id, nome: usuario.nome, perfil: 'administrador', profissionalId: null }, sessao.id);
}

export async function fetch(url: string, init: RequestInit = {}) {
  token ??= abrirSessao();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await token}`);
  return globalThis.fetch(url, { ...init, headers });
}
