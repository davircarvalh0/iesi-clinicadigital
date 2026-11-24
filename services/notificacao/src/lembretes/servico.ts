import type { PayloadConsulta } from '@clinica/eventos';
import type { Lembrete, Prisma } from '../../generated/prisma';
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

type ResultadoAvaliacao = 'obsoleto' | 'corrida' | 'aplicar';

/**
 * US-11: decide se um evento de consulta deve ser aplicado ao lembrete existente.
 * - 'cancelado' é estado terminal: nenhum agendamento ou remarcação posterior reativa.
 * - Sequência menor ou igual à última aplicada é descartada (evento fora de ordem).
 * - 'enviando' é a reserva da rotina de envio: um evento concorrente não a interrompe.
 * Evento sem `sequencia` (anterior a esta versão) sempre é aplicado, sem checagem de ordem.
 */
function avaliarEvento(existente: Lembrete | null, sequencia: number | undefined): ResultadoAvaliacao {
  if (!existente) return 'aplicar';
  if (existente.status === 'cancelado') return 'obsoleto';
  if (sequencia !== undefined && existente.sequenciaAplicada !== null && sequencia <= existente.sequenciaAplicada) {
    return 'obsoleto';
  }
  if (existente.status === 'enviando') return 'corrida';
  return 'aplicar';
}

/** Mantém a maior sequência conhecida; eventos sem `sequencia` preservam a última aplicada. */
function proximaSequencia(existente: Lembrete | null, recebida: number | undefined): number | null {
  return recebida ?? existente?.sequenciaAplicada ?? null;
}

async function registrarObsoleto(tx: Prisma.TransactionClient, payload: PayloadConsulta, idEvento: string) {
  await registrarAtividade(
    { acao: 'lembrete.evento_obsoleto', descricao: 'Evento de consulta fora de ordem ignorado', idEvento, idConsulta: payload.id_consulta },
    tx,
  );
}

async function registrarCorrida(
  tx: Prisma.TransactionClient,
  existente: Lembrete,
  payload: PayloadConsulta,
  idEvento: string,
  descricao: string,
) {
  await tx.lembrete.update({
    where: { idConsulta: payload.id_consulta },
    data: { sequenciaAplicada: proximaSequencia(existente, payload.sequencia) },
  });
  await registrarAtividade({ acao: 'lembrete.corrida_envio', descricao, idEvento, idConsulta: payload.id_consulta }, tx);
}

async function salvarProgramacao(
  tx: Prisma.TransactionClient,
  payload: PayloadConsulta,
  idEvento: string,
  acao: 'lembrete.programado' | 'lembrete.reprogramado',
) {
  const existente = await tx.lembrete.findUnique({ where: { idConsulta: payload.id_consulta } });
  const resultado = avaliarEvento(existente, payload.sequencia);
  if (resultado === 'obsoleto') return registrarObsoleto(tx, payload, idEvento);
  if (resultado === 'corrida') {
    return registrarCorrida(tx, existente!, payload, idEvento, 'Remarcação chegou com o envio já em andamento; o resultado do envio será mantido');
  }

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
    sequenciaAplicada: proximaSequencia(existente, payload.sequencia),
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
  const existente = await tx.lembrete.findUnique({ where: { idConsulta: payload.id_consulta } });
  const resultado = avaliarEvento(existente, payload.sequencia);
  if (resultado === 'obsoleto') return registrarObsoleto(tx, payload, idEvento);
  if (resultado === 'corrida') {
    return registrarCorrida(tx, existente!, payload, idEvento, 'Cancelamento chegou com o envio já em andamento; o resultado do envio será mantido');
  }

  // Já concluído com sucesso (simulado, aceito pelo provedor, ou 'enviado' legado anterior à
  // migração da US-12): o cancelamento não desfaz o envio, só registra que chegou tarde demais.
  // 'falhou' segue cancelável normalmente.
  if (existente && (existente.status === 'simulado' || existente.status === 'aceito_provedor' || existente.status === 'enviado')) {
    await tx.lembrete.update({
      where: { idConsulta: payload.id_consulta },
      data: { sequenciaAplicada: proximaSequencia(existente, payload.sequencia) },
    });
    await registrarAtividade(
      { acao: 'lembrete.cancelado', descricao: 'Consulta cancelada, mas o lembrete já tinha sido enviado', idEvento, idConsulta: payload.id_consulta },
      tx,
    );
    return;
  }

  const inicio = new Date(payload.inicio);
  await tx.lembrete.upsert({
    where: { idConsulta: payload.id_consulta },
    // Cancelamento fora de ordem, chegado antes do agendamento: grava o lembrete já como
    // cancelado (estado terminal), para o agendamento atrasado ser ignorado quando chegar.
    create: {
      idConsulta: payload.id_consulta,
      pacienteCpf: payload.paciente.cpf,
      pacienteNome: payload.paciente.nome,
      telefone: payload.paciente.telefone,
      profissional: payload.profissional,
      especialidade: payload.especialidade,
      inicioConsulta: inicio,
      enviarEm: inicio,
      idEventoConsulta: idEvento,
      status: 'cancelado',
      tentativas: 0,
      sequenciaAplicada: payload.sequencia ?? null,
    },
    update: { status: 'cancelado', sequenciaAplicada: proximaSequencia(existente, payload.sequencia) },
  });
  await registrarAtividade(
    {
      acao: 'lembrete.cancelado',
      descricao: existente ? 'Lembrete cancelado' : 'Cancelamento recebido antes do agendamento; lembrete registrado como cancelado',
      idEvento,
      idConsulta: payload.id_consulta,
    },
    tx,
  );
}
