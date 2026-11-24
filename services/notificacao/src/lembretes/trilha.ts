// US-13: trilha rastreável de um lembrete. Junta o estado atual, as atividades da consulta
// (programação, remarcação, bloqueio, cancelamento, resultado) e cada chamada ao canal de envio.
// Não expõe nome, CPF nem telefone: as atividades já são gravadas sem dados pessoais (US-16).
import { z } from 'zod';
import { prisma } from '../db';
import { ErroHttp } from '../http/erros';

export const esquemaIdConsulta = z.string().uuid('Identificador de consulta inválido.');

/** Limite de itens por lista: uma consulta tem poucas dezenas de atividades na prática. */
const LIMITE = 200;

export async function trilhaDoLembrete(idConsulta: string) {
  const lembrete = await prisma.lembrete.findUnique({
    where: { idConsulta },
    select: {
      id: true, idConsulta: true, status: true, inicioConsulta: true, enviarEm: true, enviadoEm: true,
      tentativas: true, motivoFalha: true, modoEnvio: true, canalEnvio: true, idExterno: true, idEventoConsulta: true,
      incertoResolvidoEm: true,
    },
  });
  if (!lembrete) throw new ErroHttp(404, 'Nenhum lembrete registrado para esta consulta.');

  const [tentativas, atividades, resolucoes] = await prisma.$transaction([
    prisma.tentativaEnvio.findMany({
      where: { idLembrete: lembrete.id },
      orderBy: [{ iniciadaEm: 'asc' }, { id: 'asc' }],
      take: LIMITE,
      select: {
        id: true, numero: true, idEventoConsulta: true, canal: true, modo: true, resultado: true,
        idExterno: true, motivo: true, iniciadaEm: true, concluidaEm: true,
      },
    }),
    prisma.atividade.findMany({
      where: { idConsulta },
      orderBy: [{ ocorridoEm: 'asc' }, { id: 'asc' }],
      take: LIMITE,
      select: { id: true, acao: true, descricao: true, idEvento: true, ocorridoEm: true },
    }),
    // US-15: decisões sobre envios incertos. `solicitante` é o nome de quem opera a recepção, não do paciente.
    prisma.resolucaoEnvio.findMany({
      where: { idLembrete: lembrete.id },
      orderBy: [{ registradaEm: 'asc' }, { id: 'asc' }],
      take: LIMITE,
      select: { id: true, acao: true, solicitante: true, registradaEm: true },
    }),
  ]);
  return { lembrete, tentativas, atividades, resolucoes };
}
