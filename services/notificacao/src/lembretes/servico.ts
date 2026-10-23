import type { PayloadConsulta } from '@clinica/eventos';
import type { Prisma } from '../../generated/prisma';
import { dataHora, registrarAtividade } from '../atividades/registro';
import { config } from '../config';
import { prisma } from '../db';

export function listarLembretes(filtro: { idConsulta?: string }) {
  return prisma.lembrete.findMany({
    where: filtro.idConsulta ? { idConsulta: filtro.idConsulta } : undefined,
    orderBy: { enviarEm: 'asc' },
  });
}

export function calcularEnvio(inicioConsulta: Date): Date {
  return new Date(inicioConsulta.getTime() - config.antecedenciaMinutos * 60_000);
}

// As funções abaixo recebem a transação do consumidor, para gravar o lembrete
// e o id_evento processado juntos.

export async function programar(tx: Prisma.TransactionClient, payload: PayloadConsulta, idEvento: string) {
  const inicio = new Date(payload.inicio);
  const dados = {
    pacienteNome: payload.paciente.nome,
    telefone: payload.paciente.telefone,
    profissional: payload.profissional,
    especialidade: payload.especialidade,
    inicioConsulta: inicio,
    enviarEm: calcularEnvio(inicio),
    status: 'programado' as const,
    tentativas: 0,
    motivoFalha: null,
    enviadoEm: null,
  };
  const lembrete = await tx.lembrete.upsert({
    where: { idConsulta: payload.id_consulta },
    create: { idConsulta: payload.id_consulta, ...dados },
    update: dados,
  });
  await registrarAtividade(
    {
      acao: 'lembrete.programado',
      descricao: `${payload.paciente.nome}: lembrete programado para ${dataHora(lembrete.enviarEm)}`,
      idEvento,
      idConsulta: payload.id_consulta,
    },
    tx,
  );
}

export async function reprogramar(tx: Prisma.TransactionClient, payload: PayloadConsulta, idEvento: string) {
  const existente = await tx.lembrete.findUnique({ where: { idConsulta: payload.id_consulta } });
  // Se o "agendada" ainda não chegou ou foi perdido, a remarcação já basta para programar.
  if (!existente) return programar(tx, payload, idEvento);

  const inicio = new Date(payload.inicio);
  const lembrete = await tx.lembrete.update({
    where: { id: existente.id },
    data: {
      inicioConsulta: inicio,
      enviarEm: calcularEnvio(inicio),
      status: 'programado',
      tentativas: 0,
      motivoFalha: null,
      enviadoEm: null,
    },
  });
  await registrarAtividade(
    {
      acao: 'lembrete.reprogramado',
      descricao: `${payload.paciente.nome}: lembrete reprogramado para ${dataHora(lembrete.enviarEm)}`,
      idEvento,
      idConsulta: payload.id_consulta,
    },
    tx,
  );
}

export async function cancelar(tx: Prisma.TransactionClient, payload: PayloadConsulta, idEvento: string) {
  const { count } = await tx.lembrete.updateMany({
    where: { idConsulta: payload.id_consulta, status: { in: ['programado', 'falhou'] } },
    data: { status: 'cancelado' },
  });
  await registrarAtividade(
    {
      acao: 'lembrete.cancelado',
      descricao: count
        ? `${payload.paciente.nome}: lembrete cancelado`
        : `${payload.paciente.nome}: consulta cancelada, mas o lembrete já tinha sido enviado`,
      idEvento,
      idConsulta: payload.id_consulta,
    },
    tx,
  );
}
