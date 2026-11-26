import { createHmac, timingSafeEqual } from 'node:crypto';

export type Perfil = 'administrador' | 'recepcionista' | 'profissional';
export interface Identidade { id: string; nome: string; perfil: Perfil; profissionalId: string | null; }
const PERFIS = new Set<Perfil>(['administrador', 'recepcionista', 'profissional']);
function chave() {
  const valor = process.env.AUTH_SECRET;
  if (!valor || Buffer.byteLength(valor) < 32) throw new Error('AUTH_SECRET deve ter pelo menos 32 bytes');
  return valor;
}
export function emitirAcesso(usuario: Identidade) {
  const dados = Buffer.from(JSON.stringify({ ...usuario, exp: Date.now() + 30 * 60_000 })).toString('base64url');
  return `${dados}.${createHmac('sha256', chave()).update(dados).digest('base64url')}`;
}
export function verificarAcesso(authorization: string | undefined): Identidade | null {
  try {
    const partes = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
    if (!partes) return null;
    const [, dados, assinatura] = partes;
    const esperada = createHmac('sha256', chave()).update(dados).digest();
    const recebida = Buffer.from(assinatura, 'base64url');
    if (recebida.length !== esperada.length || !timingSafeEqual(esperada, recebida)) return null;
    const u = JSON.parse(Buffer.from(dados, 'base64url').toString('utf8'));
    if (!u || typeof u.id !== 'string' || typeof u.nome !== 'string' || !PERFIS.has(u.perfil) || typeof u.exp !== 'number' || u.exp <= Date.now()) return null;
    if (u.perfil === 'profissional' && typeof u.profissionalId !== 'string') return null;
    return { id: u.id, nome: u.nome, perfil: u.perfil, profissionalId: u.profissionalId ?? null };
  } catch { return null; }
}
