import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { DURACAO_ACESSO_MS, emitirAcesso, type IdentidadeAcesso } from '@clinica/eventos';
import type { Prisma } from '../generated/prisma';
import { prisma } from './db';
import { enfileirar, ErroCadastro } from './servico';
import { encerrarSessoes, exigirSessao } from './sessao';

const derivar = promisify(scrypt);
const senha = z.string().min(12).max(128);
const email = z.email().max(254).transform(v => v.toLowerCase());
const nome = z.string().trim().min(3).max(80);
/** Perfis de funcionário. O perfil paciente (US-27) só nasce ligado a um paciente e não é trocado. */
const perfilEquipe = z.enum(['administrador', 'recepcionista', 'profissional']);
const publico = { id: true, nome: true, email: true, perfil: true, profissionalId: true, pacienteId: true, ativo: true, criadoEm: true, atualizadoEm: true } as const;
const vinculoCoerente = (u: { perfil: string; profissionalId?: string | null; pacienteId?: string | null }) =>
  (u.perfil === 'profissional') === !!u.profissionalId && (u.perfil === 'paciente') === !!u.pacienteId;
const cadastro = z.object({
  nome, email, senha, perfil: z.enum([...perfilEquipe.options, 'paciente']),
  profissionalId: z.uuid().nullable().optional(), pacienteId: z.uuid().nullable().optional(),
}).refine(vinculoCoerente);
const edicao = z.object({ nome, email, perfil: perfilEquipe, profissionalId: z.uuid().nullable() }).partial().strict()
  .refine(d => Object.keys(d).length > 0);
const minhaConta = z.object({
  nome, email,
  telefone: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => /^(?:55)?[1-9]\d{9,10}$/.test(v), 'Informe DDD e telefone válidos'),
}).partial().strict().refine(d => Object.keys(d).length > 0);
/** Validade do código de recuperação de senha. */
const VALIDADE_RECUPERACAO_MS = 30 * 60_000;

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
const HASH_FICTICIO = '00000000000000000000000000000000:' + '00'.repeat(64);
const hashCodigo = (codigo: string) => createHash('sha256').update(codigo).digest('hex');

export async function inicializarAdministrador() {
  if (!process.env.AUTH_SECRET || Buffer.byteLength(process.env.AUTH_SECRET) < 32) throw new Error('AUTH_SECRET inválido');
  const emailAdmin = process.env.ADMIN_EMAIL;
  const senhaAdmin = process.env.ADMIN_SENHA;
  if (await prisma.usuario.count()) return;
  if (!emailAdmin || !senhaAdmin) throw new Error('Configure ADMIN_EMAIL e ADMIN_SENHA para o primeiro acesso');
  const dados = cadastro.parse({ nome: 'Administrador', email: emailAdmin, senha: senhaAdmin, perfil: 'administrador' });
  await prisma.usuario.create({ data: { nome: dados.nome, email: dados.email, perfil: dados.perfil, senhaHash: await hash(dados.senha) } });
}

/**
 * Entrega do código de recuperação. Não há serviço de e-mail no protótipo: o envio é simulado no log
 * do Cadastro (como CANAL_ENVIO=log na Notificação). O e-mail não vai para o log.
 */
export type EntregaRecuperacao = (codigo: string) => void;
let entregarRecuperacao: EntregaRecuperacao = (codigo) => {
  console.log(`[cadastro] recuperação de senha (envio simulado; destinatário omitido): código ${codigo}, válido por 30 min`);
};
export function definirEntregaRecuperacao(entrega: EntregaRecuperacao) { entregarRecuperacao = entrega; }

/** Limite simples por IP e rota: 10 falhas por minuto. */
function limitador() {
  const falhas = new Map<string, { quantidade: number; ate: number }>();
  return {
    bloqueado(req: Request) { const a = falhas.get(req.ip ?? 'local'); return !!a && a.ate > Date.now() && a.quantidade >= 10; },
    falhou(req: Request) {
      const chave = req.ip ?? 'local', anterior = falhas.get(chave);
      falhas.set(chave, { quantidade: anterior && anterior.ate > Date.now() ? anterior.quantidade + 1 : 1, ate: Date.now() + 60_000 });
    },
    limpar(req: Request) { falhas.delete(req.ip ?? 'local'); },
  };
}
const MUITAS_TENTATIVAS = { erro: 'Muitas tentativas. Aguarde alguns minutos.' };

/** Impede que a clínica fique sem administrador ativo. Roda dentro da transação, com trava. */
async function garantirOutroAdministrador(tx: Prisma.TransactionClient, alvo: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(250001)`;
  const outros = await tx.usuario.count({ where: { perfil: 'administrador', ativo: true, id: { not: alvo } } });
  if (!outros) throw new ErroCadastro(409, 'A clínica precisa de ao menos um administrador ativo.');
}

const eu = (res: Response) => res.locals.usuario as IdentidadeAcesso;
const conflitoEmail = (erro: unknown) => (erro as { code?: string }).code === 'P2002';

export const rotasUsuarios = Router();
rotasUsuarios.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ---------- sem login ----------
const tentativasLogin = limitador();
rotasUsuarios.post('/login', async (req, res) => {
  if (tentativasLogin.bloqueado(req)) { res.status(429).json(MUITAS_TENTATIVAS); return; }
  const entrada = z.object({ email, senha: z.string().min(1).max(128) }).parse(req.body);
  const usuario = await prisma.usuario.findUnique({ where: { email: entrada.email } });
  const valido = await conferir(entrada.senha, usuario?.senhaHash ?? HASH_FICTICIO);
  if (!usuario || !valido) { tentativasLogin.falhou(req); res.status(401).json({ erro: 'E-mail ou senha inválidos.' }); return; }
  tentativasLogin.limpar(req);
  if (!usuario.ativo) { res.status(403).json({ erro: 'Conta desativada. Procure o administrador da clínica.' }); return; }
  const expiraEm = new Date(Date.now() + DURACAO_ACESSO_MS);
  const sessao = await prisma.sessao.create({ data: { usuarioId: usuario.id, expiraEm } });
  const { id, nome, perfil, profissionalId, pacienteId } = usuario;
  const identidade = { id, nome, perfil, profissionalId, ...(perfil === 'paciente' ? { pacienteId } : {}) };
  res.json({ usuario: identidade, token: emitirAcesso(identidade, sessao.id), expiraEm });
});

const tentativasRecuperacao = limitador();
const RESPOSTA_RECUPERACAO = { mensagem: 'Se o e-mail estiver cadastrado, enviaremos um código para redefinir a senha.' };
rotasUsuarios.post('/recuperar-senha', async (req, res) => {
  if (tentativasRecuperacao.bloqueado(req)) { res.status(429).json(MUITAS_TENTATIVAS); return; }
  const entrada = z.object({ email }).parse(req.body);
  tentativasRecuperacao.falhou(req); // conta todo pedido: o limite vale também para e-mails existentes
  const usuario = await prisma.usuario.findUnique({ where: { email: entrada.email }, select: { id: true, ativo: true } });
  // Mesma resposta com ou sem conta: a rota não revela quais e-mails existem.
  if (usuario?.ativo) {
    const codigo = randomBytes(24).toString('base64url');
    await prisma.$transaction(async (tx) => {
      // Um pedido novo invalida os anteriores ainda não usados.
      await tx.redefinicaoSenha.updateMany({ where: { usuarioId: usuario.id, usadaEm: null }, data: { usadaEm: new Date() } });
      await tx.redefinicaoSenha.create({ data: { usuarioId: usuario.id, codigoHash: hashCodigo(codigo), expiraEm: new Date(Date.now() + VALIDADE_RECUPERACAO_MS) } });
    });
    entregarRecuperacao(codigo);
  }
  res.status(202).json(RESPOSTA_RECUPERACAO);
});

const tentativasRedefinicao = limitador();
rotasUsuarios.post('/redefinir-senha', async (req, res) => {
  if (tentativasRedefinicao.bloqueado(req)) { res.status(429).json(MUITAS_TENTATIVAS); return; }
  const entrada = z.object({ codigo: z.string().min(16).max(128), novaSenha: senha }).parse(req.body);
  const novaHash = await hash(entrada.novaSenha);
  const aplicado = await prisma.$transaction(async (tx) => {
    // updateMany com as condições garante uso único mesmo com dois pedidos simultâneos.
    const agora = new Date();
    const pedido = await tx.redefinicaoSenha.findUnique({ where: { codigoHash: hashCodigo(entrada.codigo) }, include: { usuario: { select: { ativo: true } } } });
    if (!pedido || !pedido.usuario.ativo) return false;
    const marcado = await tx.redefinicaoSenha.updateMany({ where: { id: pedido.id, usadaEm: null, expiraEm: { gt: agora } }, data: { usadaEm: agora } });
    if (!marcado.count) return false;
    await tx.usuario.update({ where: { id: pedido.usuarioId }, data: { senhaHash: novaHash } });
    await encerrarSessoes(tx, pedido.usuarioId);
    return true;
  });
  if (!aplicado) { tentativasRedefinicao.falhou(req); res.status(400).json({ erro: 'Código inválido ou expirado. Peça um novo.' }); return; }
  tentativasRedefinicao.limpar(req);
  res.sendStatus(204);
});

// ---------- qualquer perfil, com sessão ----------
rotasUsuarios.post('/logout', exigirSessao(), async (_req, res) => {
  await prisma.sessao.updateMany({ where: { id: eu(res).sessaoId, encerradaEm: null }, data: { encerradaEm: new Date() } });
  res.sendStatus(204);
});

rotasUsuarios.patch('/minha-conta/senha', exigirSessao(), async (req, res) => {
  const entrada = z.object({ senhaAtual: z.string().min(1).max(128), novaSenha: senha }).strict().parse(req.body);
  if (entrada.senhaAtual === entrada.novaSenha) throw new ErroCadastro(400, 'A nova senha deve ser diferente da atual.');
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: eu(res).id } });
  if (!await conferir(entrada.senhaAtual, usuario.senhaHash)) throw new ErroCadastro(400, 'Senha atual incorreta.');
  const senhaHash = await hash(entrada.novaSenha);
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: usuario.id }, data: { senhaHash } });
    // Mantém a sessão de quem trocou; derruba as outras (outro computador, senha vazada).
    await encerrarSessoes(tx, usuario.id, eu(res).sessaoId);
  });
  res.sendStatus(204);
});

/**
 * US-27: nome e e-mail da própria conta. No perfil paciente, nome e telefone também atualizam o
 * cadastro mestre (nova revisão + `paciente.atualizado`), como a edição feita pela recepção.
 */
rotasUsuarios.patch('/minha-conta', exigirSessao(), async (req, res) => {
  const dados = minhaConta.parse(req.body);
  const conta = await prisma.usuario.findUniqueOrThrow({ where: { id: eu(res).id } });
  if (dados.telefone !== undefined && conta.perfil !== 'paciente') throw new ErroCadastro(400, 'Telefone só se altera na conta de paciente.');
  try {
    res.json(await prisma.$transaction(async (tx) => {
      const atualizado = await tx.usuario.update({ where: { id: conta.id }, data: { nome: dados.nome, email: dados.email }, select: publico });
      if (conta.pacienteId && (dados.nome !== undefined || dados.telefone !== undefined)) {
        const paciente = await tx.paciente.update({ where: { id: conta.pacienteId }, data: { nome: dados.nome, telefone: dados.telefone, revisao: { increment: 1 } } });
        await enfileirar(tx, paciente, `paciente-${paciente.id}`);
      }
      return atualizado;
    }));
  } catch (erro) {
    if (conflitoEmail(erro)) { res.status(409).json({ erro: 'E-mail já cadastrado.' }); return; }
    throw erro;
  }
});

// ---------- equipe da recepção: a recepcionista só abre contas de paciente ----------
rotasUsuarios.post('/', exigirSessao(['administrador', 'recepcionista']), async (req, res) => {
  const dados = cadastro.parse(req.body);
  if (eu(res).perfil !== 'administrador' && dados.perfil !== 'paciente') { res.status(403).json({ erro: 'Acesso restrito.' }); return; }
  const senhaHash = await hash(dados.senha);
  try {
    res.status(201).json(await prisma.$transaction(async (tx) => {
      // Validação do vínculo: a conta do portal só existe para um paciente do cadastro mestre.
      const paciente = dados.pacienteId ? await tx.paciente.findUnique({ where: { id: dados.pacienteId } }) : null;
      if (dados.pacienteId && !paciente) throw new ErroCadastro(404, 'Paciente não encontrado.');
      if (paciente && await tx.usuario.findUnique({ where: { pacienteId: paciente.id }, select: { id: true } })) throw new ErroCadastro(409, 'Este paciente já tem conta.');
      const criado = await tx.usuario.create({ data: {
        nome: dados.nome, email: dados.email, perfil: dados.perfil, senhaHash,
        profissionalId: dados.profissionalId ?? null, pacienteId: dados.pacienteId ?? null,
      }, select: publico });
      // Garante que o Agendamento tenha a cópia de contato antes da primeira solicitação pelo portal.
      if (paciente) await enfileirar(tx, paciente, `paciente-${paciente.id}`);
      return criado;
    }));
  } catch (erro) {
    if (conflitoEmail(erro)) { res.status(409).json({ erro: 'E-mail já cadastrado.' }); return; }
    throw erro;
  }
});

// ---------- só administrador ----------
rotasUsuarios.use(exigirSessao(['administrador']));

rotasUsuarios.get('/', async (_req, res) => { res.json(await prisma.usuario.findMany({ select: publico, orderBy: { nome: 'asc' } })); });

const idUsuario = z.uuid();
async function buscar(tx: Prisma.TransactionClient, id: string) {
  const usuario = await tx.usuario.findUnique({ where: { id: idUsuario.parse(id) }, select: publico });
  if (!usuario) throw new ErroCadastro(404, 'Usuário não encontrado.');
  return usuario;
}

rotasUsuarios.get('/:id', async (req, res) => { res.json(await buscar(prisma, req.params.id)); });

rotasUsuarios.patch('/:id', async (req, res) => {
  const mudancas = edicao.parse(req.body);
  try {
    res.json(await prisma.$transaction(async (tx) => {
      const atual = await buscar(tx, req.params.id);
      if (atual.perfil === 'paciente' && (mudancas.perfil || mudancas.profissionalId !== undefined)) throw new ErroCadastro(400, 'A conta de paciente não muda de perfil.');
      const final = { ...atual, ...mudancas };
      // Ao sair do perfil profissional, o vínculo é desfeito junto.
      if (mudancas.perfil && mudancas.perfil !== 'profissional' && mudancas.profissionalId === undefined) final.profissionalId = null;
      if (!vinculoCoerente(final)) throw new ErroCadastro(400, 'O perfil profissional exige o vínculo com um profissional (e só ele).');
      if (atual.perfil === 'administrador' && final.perfil !== 'administrador' && atual.ativo) await garantirOutroAdministrador(tx, atual.id);
      const atualizado = await tx.usuario.update({
        where: { id: atual.id },
        data: { nome: final.nome, email: final.email, perfil: final.perfil, profissionalId: final.profissionalId },
        select: publico,
      });
      // O token carrega nome, perfil e vínculo: quem mudou de acesso precisa entrar de novo.
      if (final.perfil !== atual.perfil || final.profissionalId !== atual.profissionalId) await encerrarSessoes(tx, atual.id);
      return atualizado;
    }));
  } catch (erro) {
    if (conflitoEmail(erro)) { res.status(409).json({ erro: 'E-mail já cadastrado.' }); return; }
    throw erro;
  }
});

rotasUsuarios.patch('/:id/status', async (req, res) => {
  const { ativo } = z.object({ ativo: z.boolean() }).strict().parse(req.body);
  res.json(await prisma.$transaction(async (tx) => {
    const atual = await buscar(tx, req.params.id);
    if (!ativo && atual.id === eu(res).id) throw new ErroCadastro(409, 'Você não pode desativar a própria conta.');
    if (!ativo && atual.ativo && atual.perfil === 'administrador') await garantirOutroAdministrador(tx, atual.id);
    const atualizado = await tx.usuario.update({ where: { id: atual.id }, data: { ativo }, select: publico });
    if (!ativo) await encerrarSessoes(tx, atual.id);
    return atualizado;
  }));
});
