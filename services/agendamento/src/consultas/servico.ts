import { criarEnvelope, idCorrelacaoConsulta, type PayloadConsulta, type TipoEventoConsulta } from '@clinica/eventos';
import type { Consulta, Prisma } from '../../generated/prisma';
import { ORIGEM } from '../config';
import { prisma } from '../db';
import { ErroHttp } from '../http/erros';
import type { NovaConsulta, Remarcacao } from './validacao';

export function listarConsultas() {
  return prisma.consulta.findMany({ orderBy: { inicio: 'asc' } });
}

export function agendar(dados: NovaConsulta): Promise<Consulta> {
  return prisma.$transaction(async (tx) => {
    const consulta = await tx.consulta.create({
      data: {
        pacienteNome: dados.nome,
        pacienteCpf: dados.cpf,
        pacienteTelefone: dados.telefone,
        profissional: dados.profissional,
        especialidade: dados.especialidade,
        inicio: dados.inicio,
      },
    });
    await registrarEvento(tx, 'consulta.agendada', consulta);
    return consulta;
  });
}

export function remarcar(id: string, dados: Remarcacao): Promise<Consulta> {
  return prisma.$transaction(async (tx) => {
    await buscarAtiva(tx, id);
    const consulta = await tx.consulta.update({ where: { id }, data: { inicio: dados.inicio } });
    await registrarEvento(tx, 'consulta.reagendada', consulta);
    return consulta;
  });
}

export function cancelar(id: string): Promise<Consulta> {
  return prisma.$transaction(async (tx) => {
    await buscarAtiva(tx, id);
    const consulta = await tx.consulta.update({ where: { id }, data: { status: 'cancelada' } });
    await registrarEvento(tx, 'consulta.cancelada', consulta);
    return consulta;
  });
}

async function buscarAtiva(tx: Prisma.TransactionClient, id: string): Promise<Consulta> {
  const consulta = await tx.consulta.findUnique({ where: { id } });
  if (!consulta) throw new ErroHttp(404, 'Consulta não encontrada');
  if (consulta.status === 'cancelada') throw new ErroHttp(409, 'Consulta já cancelada');
  return consulta;
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
  };
}
