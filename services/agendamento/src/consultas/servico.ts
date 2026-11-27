import { criarEnvelope, idCorrelacaoConsulta, type PayloadConsulta, type TipoEventoConsulta } from '@clinica/eventos';
import type { Consulta, Prisma } from '../../generated/prisma';
import { ORIGEM } from '../config';
import { prisma } from '../db';
import { ErroHttp } from '../http/erros';
import type { NovaConsulta, Remarcacao } from './validacao';

export function listarConsultas(profissionalId?: string) {
  return prisma.consulta.findMany({ where: profissionalId ? { profissionalId } : undefined, orderBy: { inicio: 'asc' } });
}

/** US-28: situações em que a consulta ainda vai acontecer (pode ser remarcada, cancelada, encerrada). */
export const SITUACOES_ATIVAS = ['agendada', 'confirmada'] as const;
/** Ocupam o horário do profissional: tudo, menos cancelada. */
const SITUACOES_QUE_OCUPAM = ['agendada', 'confirmada', 'concluida', 'falta'] as const;

/**
 * US-26: recusa a consulta que se sobrepõe a outra ativa do mesmo profissional.
 * A trava por profissional (pg_advisory_xact_lock) serializa agendamentos e remarcações simultâneos
 * até o fim da transação, então dois pedidos para o mesmo horário não passam juntos.
 */
export async function garantirHorarioLivre(tx: Prisma.TransactionClient, profissionalId: string, inicio: Date, duracaoMinutos: number, ignorarId = '') {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${profissionalId}))`;
  const fim = new Date(inicio.getTime() + duracaoMinutos * 60_000);
  const conflito = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM consultas
    WHERE profissional_id = ${profissionalId} AND id <> ${ignorarId}
      AND status::text = ANY(${[...SITUACOES_QUE_OCUPAM]})
      AND inicio < ${fim} AND inicio + make_interval(mins => duracao_minutos) > ${inicio}
    LIMIT 1`;
  if (conflito.length) throw new ErroHttp(409, 'Horário indisponível: o profissional já tem consulta nesse horário.');
}

export function agendar(dados: NovaConsulta): Promise<Consulta> {
  return prisma.$transaction(async (tx) => {
    const profissional = await tx.profissional.findUnique({ where: { nome: dados.profissional } });
    if (!profissional || profissional.especialidade !== dados.especialidade) throw new ErroHttp(400, 'Profissional ou especialidade inválidos.');
    if (!profissional.ativo) throw new ErroHttp(409, 'Profissional inativo: não recebe novas consultas.');
    await garantirHorarioLivre(tx, profissional.id, dados.inicio, profissional.duracaoConsultaMinutos);
    const consulta = await tx.consulta.create({
      data: {
        idPaciente: dados.idPaciente,
        vinculoPacientePendente: true,
        pacienteNome: dados.nome,
        pacienteCpf: dados.cpf,
        pacienteTelefone: dados.telefone,
        profissional: dados.profissional,
        profissionalId: profissional.id,
        especialidade: dados.especialidade,
        inicio: dados.inicio,
        duracaoMinutos: profissional.duracaoConsultaMinutos,
      },
    });
    await registrarEvento(tx, 'consulta.agendada', consulta);
    return consulta;
  });
}

export function remarcar(id: string, dados: Remarcacao): Promise<Consulta> {
  return prisma.$transaction(async (tx) => {
    const atual = await buscarAtiva(tx, id);
    await garantirHorarioLivre(tx, atual.profissionalId, dados.inicio, atual.duracaoMinutos, atual.id);
    const consulta = await tx.consulta.update({
      where: { id },
      // A confirmação era para o horário antigo: volta a agendada (US-28).
      data: { inicio: dados.inicio, sequencia: { increment: 1 }, status: 'agendada', confirmadaEm: null, confirmadaPor: null },
    });
    await registrarEvento(tx, 'consulta.reagendada', consulta);
    return consulta;
  });
}

export function cancelar(id: string): Promise<Consulta> {
  return prisma.$transaction(async (tx) => {
    await buscarAtiva(tx, id);
    const consulta = await tx.consulta.update({
      where: { id },
      data: { status: 'cancelada', sequencia: { increment: 1 } },
    });
    await registrarEvento(tx, 'consulta.cancelada', consulta);
    return consulta;
  });
}

async function buscarAtiva(tx: Prisma.TransactionClient, id: string): Promise<Consulta> {
  // FOR UPDATE: mudanças simultâneas na mesma consulta são aplicadas uma de cada vez.
  const [linha] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM consultas WHERE id = ${id} FOR UPDATE`;
  const consulta = linha ? await tx.consulta.findUnique({ where: { id } }) : null;
  if (!consulta) throw new ErroHttp(404, 'Consulta não encontrada');
  if (consulta.status === 'cancelada') throw new ErroHttp(409, 'Consulta já cancelada');
  if (consulta.status === 'concluida' || consulta.status === 'falta') throw new ErroHttp(409, 'Consulta já encerrada');
  return consulta;
}

export type OrigemConfirmacao = 'recepcao' | 'portal' | 'whatsapp';
export type NovaSituacao = 'confirmada' | 'concluida' | 'falta';

/**
 * US-28: transições permitidas.
 * - agendada → confirmada (antes do início);
 * - agendada | confirmada → concluida | falta (a partir do início da consulta).
 * Confirmar de novo uma consulta confirmada não muda nada (idempotente: reenvio do WhatsApp, duplo clique).
 */
export async function aplicarSituacao(tx: Prisma.TransactionClient, id: string, nova: NovaSituacao, origem: OrigemConfirmacao, agora = new Date()): Promise<Consulta> {
  const atual = await buscarAtiva(tx, id);
  if (nova === 'confirmada') {
    if (atual.status === 'confirmada') return atual;
    if (atual.inicio <= agora) throw new ErroHttp(409, 'A consulta já começou: não dá mais para confirmar.');
    return tx.consulta.update({ where: { id }, data: { status: 'confirmada', confirmadaEm: agora, confirmadaPor: origem } });
  }
  if (atual.inicio > agora) throw new ErroHttp(409, 'Só dá para registrar presença ou falta depois do início da consulta.');
  return tx.consulta.update({ where: { id }, data: { status: nova, encerradaEm: agora } });
}

export function mudarSituacao(id: string, nova: NovaSituacao, origem: OrigemConfirmacao = 'recepcao') {
  return prisma.$transaction((tx) => aplicarSituacao(tx, id, nova, origem));
}

/** Grava o evento na outbox usando a transação recebida (nunca publica direto no RabbitMQ). */
export async function registrarEvento(tx: Prisma.TransactionClient, tipo: TipoEventoConsulta, consulta: Consulta) {
  const envelope = criarEnvelope({
    tipo,
    origem: ORIGEM,
    id_correlacao: idCorrelacaoConsulta(consulta.id),
    payload: paraPayload(consulta),
  });
  await tx.eventoSaida.create({
    data: { idEvento: envelope.id_evento, tipo, envelope: envelope as unknown as Prisma.InputJsonValue },
  });
}

function paraPayload(c: Consulta): PayloadConsulta {
  return {
    id_consulta: c.id,
    paciente: { cpf: c.pacienteCpf, nome: c.pacienteNome, telefone: c.pacienteTelefone },
    profissional: c.profissional,
    especialidade: c.especialidade,
    inicio: c.inicio.toISOString(),
    sequencia: c.sequencia,
  };
}
