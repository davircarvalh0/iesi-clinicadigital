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

// Trechos com 8 ou mais dígitos (CPF, telefone, mesmo com máscara) viram "***".
// Protege textos vindos de fora, como erros do provedor de mensagens.
export const mascararDados = (texto: string) =>
  texto.replace(/\+?\d[\d\s().-]*\d/g, (trecho) => (trecho.replace(/\D/g, '').length >= 8 ? '***' : trecho));

/**
 * Registra uma atividade. Recebe a transação quando faz parte do processamento de um evento.
 * A descrição não leva nome, CPF nem telefone: a consulta é identificada por `idConsulta`.
 */
export async function registrarAtividade(dados: DadosAtividade, db: Prisma.TransactionClient = prisma) {
  const atividade = { ...dados, descricao: mascararDados(dados.descricao) };
  await db.atividade.create({ data: atividade });
  const consulta = atividade.idConsulta ? ` consulta=${atividade.idConsulta.slice(0, 8)}` : '';
  console.log(`[atividade] ${atividade.acao}${consulta}: ${atividade.descricao}`);
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
