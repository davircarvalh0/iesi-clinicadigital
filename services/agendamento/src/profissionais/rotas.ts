import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import { deHHMM, intervalosSobrepostos, paraHHMM } from '../agenda/horario';
import { prisma } from '../db';
import { equipeOuOProprio, permitir, usuarioDe } from '../http/acesso';
import { ErroHttp } from '../http/erros';

export const rotasProfissionais = Router();

const nome = z.string().trim().min(3).max(120);
const especialidade = z.string().trim().min(2).max(120);
const duracao = z.number('Duração inválida.').int('Duração inválida.').min(5, 'Duração mínima de 5 minutos.').max(240, 'Duração máxima de 240 minutos.');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Horário inválido. Use HH:MM.');
const esquemaDisponibilidade = z.object({
  duracaoConsultaMinutos: duracao.optional(),
  intervalos: z.array(z.object({
    diaSemana: z.number().int().min(0).max(6, 'Dia da semana de 0 (domingo) a 6 (sábado).'),
    inicio: hhmm,
    fim: hhmm,
  }).strict()).max(42, 'No máximo 42 intervalos.'),
}).strict();

const idProfissional = z.uuid('Identificador do profissional inválido.');
const conflitoNome = (erro: unknown) => (erro as { code?: string }).code === 'P2002';

async function buscar(tx: Prisma.TransactionClient, id: string) {
  const profissional = await tx.profissional.findUnique({ where: { id: idProfissional.parse(id) } });
  if (!profissional) throw new ErroHttp(404, 'Profissional não encontrado.');
  return profissional;
}

rotasProfissionais.get('/', permitir('administrador', 'recepcionista', 'paciente'), async (_req, res) => {
  // US-27: o paciente vê só os ativos, para escolher com quem marcar.
  if (usuarioDe(res).perfil === 'paciente') {
    res.json(await prisma.profissional.findMany({ where: { ativo: true }, select: { id: true, nome: true, especialidade: true, duracaoConsultaMinutos: true }, orderBy: { nome: 'asc' } }));
    return;
  }
  res.json(await prisma.profissional.findMany({ orderBy: { nome: 'asc' } }));
});

rotasProfissionais.post('/', permitir('administrador'), async (req, res) => {
  const dados = z.object({ nome, especialidade, duracaoConsultaMinutos: duracao.optional() }).parse(req.body);
  try { res.status(201).json(await prisma.profissional.create({ data: dados })); }
  catch (erro) { if (conflitoNome(erro)) throw new ErroHttp(409, 'Profissional já cadastrado.'); throw erro; }
});

rotasProfissionais.get('/:id', equipeOuOProprio, async (req, res) => { res.json(await buscar(prisma, String(req.params.id))); });

// Nome e especialidade novos valem para as próximas consultas; as já marcadas guardam a cópia da época.
rotasProfissionais.patch('/:id', permitir('administrador'), async (req, res) => {
  const dados = z.object({ nome, especialidade, duracaoConsultaMinutos: duracao }).partial().strict()
    .refine((d) => Object.keys(d).length > 0, 'Informe ao menos um campo.').parse(req.body);
  await buscar(prisma, String(req.params.id));
  try { res.json(await prisma.profissional.update({ where: { id: String(req.params.id) }, data: dados })); }
  catch (erro) { if (conflitoNome(erro)) throw new ErroHttp(409, 'Já existe um profissional com esse nome.'); throw erro; }
});

rotasProfissionais.patch('/:id/status', permitir('administrador'), async (req, res) => {
  const { ativo } = z.object({ ativo: z.boolean() }).strict().parse(req.body);
  await buscar(prisma, String(req.params.id));
  res.json(await prisma.profissional.update({ where: { id: String(req.params.id) }, data: { ativo } }));
});

function disponibilidadePublica(p: { id: string; duracaoConsultaMinutos: number }, intervalos: { diaSemana: number; inicioMinutos: number; fimMinutos: number }[]) {
  return {
    profissionalId: p.id,
    duracaoConsultaMinutos: p.duracaoConsultaMinutos,
    intervalos: intervalos
      .sort((a, b) => a.diaSemana - b.diaSemana || a.inicioMinutos - b.inicioMinutos)
      .map((i) => ({ diaSemana: i.diaSemana, inicio: paraHHMM(i.inicioMinutos), fim: paraHHMM(i.fimMinutos) })),
  };
}

rotasProfissionais.get('/:id/disponibilidade', equipeOuOProprio, async (req, res) => {
  const profissional = await buscar(prisma, String(req.params.id));
  const intervalos = await prisma.disponibilidade.findMany({ where: { profissionalId: profissional.id } });
  res.json(disponibilidadePublica(profissional, intervalos));
});

/** Substitui a semana inteira (lista vazia = sem disponibilidade). */
rotasProfissionais.put('/:id/disponibilidade', permitir('administrador'), async (req, res) => {
  const dados = esquemaDisponibilidade.parse(req.body);
  const intervalos = dados.intervalos.map((i) => ({ diaSemana: i.diaSemana, inicioMinutos: deHHMM(i.inicio), fimMinutos: deHHMM(i.fim) }));
  if (intervalos.some((i) => i.inicioMinutos >= i.fimMinutos)) throw new ErroHttp(400, 'Dados inválidos. O início de cada intervalo deve ser antes do fim.');
  if (intervalosSobrepostos(intervalos)) throw new ErroHttp(400, 'Dados inválidos. Intervalos do mesmo dia não podem se sobrepor.');
  res.json(await prisma.$transaction(async (tx) => {
    const atual = await buscar(tx, String(req.params.id));
    const profissional = dados.duracaoConsultaMinutos === undefined ? atual
      : await tx.profissional.update({ where: { id: atual.id }, data: { duracaoConsultaMinutos: dados.duracaoConsultaMinutos } });
    await tx.disponibilidade.deleteMany({ where: { profissionalId: atual.id } });
    await tx.disponibilidade.createMany({ data: intervalos.map((i) => ({ ...i, profissionalId: atual.id })) });
    return disponibilidadePublica(profissional, intervalos);
  }));
});
