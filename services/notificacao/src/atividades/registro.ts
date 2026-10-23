import type { Prisma } from '../../generated/prisma';
import { prisma } from '../db';

export type Acao =
  | 'lembrete.programado'
  | 'lembrete.reprogramado'
  | 'lembrete.cancelado'
  | 'lembrete.enviado'
  | 'lembrete.falhou'
  | 'envio.nova_tentativa'
  | 'evento.duplicado'
  | 'evento.nova_tentativa'
  | 'evento.rejeitado'
  | 'consumo.pausado'
  | 'consumo.retomado';

export interface DadosAtividade {
  acao: Acao;
  descricao: string;
  idEvento?: string;
  idConsulta?: string;
}

/** Registra uma atividade. Recebe a transação quando faz parte do processamento de um evento. */
export async function registrarAtividade(dados: DadosAtividade, db: Prisma.TransactionClient = prisma) {
  await db.atividade.create({ data: dados });
  console.log(`[atividade] ${dados.acao}: ${dados.descricao}`);
}

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Recife',
});

/** Ex.: "23/10 às 09:00". */
export const dataHora = (d: Date) => fmtDataHora.format(d).replace(', ', ' às ');
