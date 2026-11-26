import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import { z } from 'zod';
import { emitirAcesso, verificarAcesso } from '@clinica/eventos';
import { prisma } from './db';

const derivar = promisify(scrypt);
const senha = z.string().min(12).max(128);
const email = z.email().max(254).transform(v => v.toLowerCase());
const publico = { id: true, nome: true, email: true, perfil: true, profissionalId: true } as const;
const cadastro = z.object({ nome: z.string().trim().min(3).max(80), email, senha, perfil: z.enum(['administrador', 'recepcionista', 'profissional']), profissionalId: z.uuid().nullable().optional() }).refine(u => (u.perfil === 'profissional') === !!u.profissionalId);
async function hash(valor: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derivar(valor, salt, 64) as Buffer).toString('hex')}`;
}
async function conferir(valor: string, armazenado: string) {
  const [salt, chave] = armazenado.split(':');
  const esperado = Buffer.from(chave, 'hex');
  const obtido = await derivar(valor, salt, 64) as Buffer;
  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}
export async function inicializarAdministrador() {
  if (!process.env.AUTH_SECRET || Buffer.byteLength(process.env.AUTH_SECRET) < 32) throw new Error('AUTH_SECRET inválido');
  const emailAdmin = process.env.ADMIN_EMAIL;
  const senhaAdmin = process.env.ADMIN_SENHA;
  if (await prisma.usuario.count()) return;
  if (!emailAdmin || !senhaAdmin) throw new Error('Configure ADMIN_EMAIL e ADMIN_SENHA para o primeiro acesso');
  const dados = cadastro.parse({ nome: 'Administrador', email: emailAdmin, senha: senhaAdmin, perfil: 'administrador' });
  await prisma.usuario.create({ data: { nome: dados.nome, email: dados.email, perfil: dados.perfil, senhaHash: await hash(dados.senha) } });
}
export const rotasUsuarios = Router();
rotasUsuarios.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const falhas = new Map<string, { quantidade: number; ate: number }>();
rotasUsuarios.post('/login', async (req, res) => {
  const chave = req.ip ?? 'local';
  const anterior = falhas.get(chave);
  if (anterior && anterior.ate > Date.now() && anterior.quantidade >= 10) { res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' }); return; }
  const entrada = z.object({ email, senha: z.string().min(1).max(128) }).parse(req.body);
  const usuario = await prisma.usuario.findUnique({ where: { email: entrada.email } });
  const valido = await conferir(entrada.senha, usuario?.senhaHash ?? '00000000000000000000000000000000:' + '00'.repeat(64));
  if (!usuario || !valido) {
    falhas.set(chave, { quantidade: anterior && anterior.ate > Date.now() ? anterior.quantidade + 1 : 1, ate: Date.now() + 60_000 });
    res.status(401).json({ erro: 'E-mail ou senha inválidos.' }); return;
  }
  falhas.delete(chave);
  const { id, nome, perfil, profissionalId } = usuario;
  const identidade = { id, nome, perfil, profissionalId };
  res.set('Cache-Control', 'no-store').json({ usuario: identidade, token: emitirAcesso(identidade) });
});
rotasUsuarios.use((req, res, next) => {
  const usuario = verificarAcesso(req.headers.authorization);
  if (!usuario) { res.status(401).json({ erro: 'Login obrigatório.' }); return; }
  if (usuario.perfil !== 'administrador') { res.status(403).json({ erro: 'Acesso restrito.' }); return; }
  next();
});
rotasUsuarios.get('/', async (_req, res) => { res.json(await prisma.usuario.findMany({ select: publico, orderBy: { nome: 'asc' } })); });
rotasUsuarios.post('/', async (req, res) => {
  const dados = cadastro.parse(req.body);
  const senhaHash = await hash(dados.senha);
  try {
    res.status(201).json(await prisma.usuario.create({ data: { nome: dados.nome, email: dados.email, perfil: dados.perfil, profissionalId: dados.profissionalId ?? null, senhaHash }, select: publico }));
  } catch (erro) {
    if ((erro as { code?: string }).code === 'P2002') { res.status(409).json({ erro: 'E-mail já cadastrado.' }); return; }
    throw erro;
  }
});
