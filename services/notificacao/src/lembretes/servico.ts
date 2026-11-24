import type { PayloadConsulta } from '@clinica/eventos';
import type { Prisma } from '../../generated/prisma';
import { dataHora, registrarAtividade } from '../atividades/registro';
import { config } from '../config';
import { prisma } from '../db';
import { calcularEnvio, MOTIVO_CONSULTA_INICIADA } from './horario';

export function listarLembretes(filtro: { idConsulta?: string }) {
  return prisma.lembrete.findMany({
    where: filtro.idConsulta ? { idConsulta: filtro.idConsulta } : undefined,
    orderBy: { enviarEm: 'asc' },
  });
}

// As funções abaixo recebem a transação do consumidor, para gravar o lembrete
// e o id_evento processado juntos.

async function salvarProgramacao(
  tx: Prisma.TransactionClient,
  payload: PayloadConsulta,
  idEvento: string,
  acao: 'lembrete.programado' | 'lembrete.reprogramado',
) {
  const inicio = new Date(payload.inicio);
  const { enviarEm, expirado } = calcularEnvio(inicio, new Date(), config.antecedenciaMinutos);
  const dados = {
    pacienteCpf: payload.paciente.cpf,
    pacienteNome: payload.paciente.nome,
    telefone: payload.paciente.telefone,
    profissional: payload.profissional,
    especialidade: payload.especialidade,
    inicioConsulta: inicio,
    enviarEm,
    antecedenciaMinutos: config.antecedenciaMinutos,
    idEventoConsulta: idEvento,
    status: expirado ? 'falhou' as const : 'programado' as const,
    tentativas: 0,
    motivoFalha: expirado ? MOTIVO_CONSULTA_INICIADA : null,
    enviadoEm: null,
    modoEnvio: null,
    canalEnvio: null,
    idExterno: null,
  };
  await tx.lembrete.upsert({
    where: { idConsulta: payload.id_consulta },
    create: { idConsulta: payload.id_consulta, ...dados },
    update: dados,
  });
  await registrarAtividade(
    {
      acao: expirado ? 'lembrete.expirado' : acao,
      descricao: expirado
        ? MOTIVO_CONSULTA_INICIADA
        : `Envio previsto para ${dataHora(enviarEm)} (${config.modoAntecedencia}, antecedência de ${config.antecedenciaMinutos} min)`,
      idEvento,
      idConsulta: payload.id_consulta,
    },
    tx,
  );
}

export function programar(tx: Prisma.TransactionClient, payload: PayloadConsulta, idEvento: string) {
  return salvarProgramacao(tx, payload, idEvento, 'lembrete.programado');
}

export function reprogramar(tx: Prisma.TransactionClient, payload: PayloadConsulta, idEvento: string) {
  return salvarProgramacao(tx, payload, idEvento, 'lembrete.reprogramado');
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
        ? 'lembrete cancelado'
        : 'consulta cancelada, mas o lembrete já tinha sido enviado',
      idEvento,
      idConsulta: payload.id_consulta,
    },
    tx,
  );
}
