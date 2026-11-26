import { criarEnvelope, idCorrelacaoConsulta, type PayloadConsulta, type TipoEventoConsulta } from '@clinica/eventos';
import type { Consulta, Prisma } from '../../generated/prisma';
import { ORIGEM } from '../config';
import { prisma } from '../db';
import { ErroHttp } from '../http/erros';
import type { NovaConsulta, Remarcacao } from './validacao';

export function listarConsultas(profissionalId?: string) {
  return prisma.consulta.findMany({ where: profissionalId ? { profissionalId } : undefined, orderBy: { inicio: 'asc' } });
}

export function agendar(dados: NovaConsulta): Promise<Consulta> {
  return prisma.$transaction(async (tx) => {
    const profissional = await tx.profissional.findUnique({ where: { nome: dados.profissional } });
    if (!profissional || profissional.especialidade !== dados.especialidade) throw new ErroHttp(400, 'Profissional ou especialidade inválidos.');
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
      },
    });
    await registrarEvento(tx, 'consulta.agendada', consulta);
    return consulta;
  });
}

export function remarcar(id: string, dados: Remarcacao): Promise<Consulta> {
  return prisma.$transaction(async (tx) => {
    await buscarAtiva(tx, id);
    const consulta = await tx.consulta.update({
      where: { id },
      data: { inicio: dados.inicio, sequencia: { increment: 1 } },
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
    sequencia: c.sequencia,
  };
}
