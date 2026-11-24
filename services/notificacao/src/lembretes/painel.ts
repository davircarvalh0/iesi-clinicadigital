// US-09: listagem dedicada de lembretes para a recepção, com filtro por situação e período e paginação.
// Expõe só o necessário para acompanhar o envio: sem CPF e sem telefone (minimização, US-16).
import { z } from 'zod';
import type { Prisma, StatusLembrete } from '../../generated/prisma';
import { prisma } from '../db';

export const SITUACOES: readonly StatusLembrete[] = [
  'programado', 'enviando', 'enviado', 'simulado', 'aceito_provedor', 'falhou', 'cancelado', 'bloqueado',
];

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MSG_PAGINA = 'Página inválida. Informe um inteiro a partir de 1.';
const MSG_TAMANHO = 'Tamanho de página inválido. Informe um inteiro de 1 a 100.';

/** Dia civil AAAA-MM-DD existente no calendário (rejeita 2026-02-30). */
function diaValido(valor: string): boolean {
  if (!DATA.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

const esquemaData = (campo: string) => z.string()
  .refine(diaValido, `${campo} inválida. Use o formato AAAA-MM-DD.`)
  .optional();

export const esquemaFiltroPainel = z.object({
  // Lista separada por vírgula; vazia ou ausente significa todas as situações.
  situacao: z.string().optional().transform((valor, ctx) => {
    const itens = (valor ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const invalidas = itens.filter((s) => !SITUACOES.includes(s as StatusLembrete));
    if (invalidas.length) {
      ctx.addIssue({ code: 'custom', message: `Situação inválida: ${invalidas.join(', ')}. Use ${SITUACOES.join(', ')}.` });
      return z.NEVER;
    }
    return [...new Set(itens)] as StatusLembrete[];
  }),
  de: esquemaData('Data inicial'),
  ate: esquemaData('Data final'),
  pagina: z.coerce.number(MSG_PAGINA).int(MSG_PAGINA).min(1, MSG_PAGINA).default(1),
  tamanhoPagina: z.coerce.number(MSG_TAMANHO).int(MSG_TAMANHO).min(1, MSG_TAMANHO).max(100, MSG_TAMANHO).default(20),
}).refine((f) => !f.de || !f.ate || f.de <= f.ate, { message: 'A data inicial não pode ser posterior à data final.', path: ['de'] });

export type FiltroPainel = z.output<typeof esquemaFiltroPainel>;

/**
 * Período em dias civis de America/Recife (UTC-3, sem horário de verão desde 2019), aplicado ao
 * início da consulta: [de 00:00, dia seguinte a `ate` 00:00).
 */
export function intervaloDoPeriodo(de?: string, ate?: string): Prisma.DateTimeFilter | undefined {
  if (!de && !ate) return undefined;
  const filtro: Prisma.DateTimeFilter = {};
  if (de) filtro.gte = new Date(`${de}T00:00:00-03:00`);
  if (ate) filtro.lt = new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 86_400_000);
  return filtro;
}

/** Campos expostos na listagem. CPF e telefone ficam de fora de propósito. */
const camposPainel = {
  id: true,
  idConsulta: true,
  pacienteNome: true,
  profissional: true,
  especialidade: true,
  inicioConsulta: true,
  enviarEm: true,
  antecedenciaMinutos: true,
  status: true,
  tentativas: true,
  motivoFalha: true,
  enviadoEm: true,
  modoEnvio: true,
  canalEnvio: true,
  idExterno: true,
  atualizadoEm: true,
} satisfies Prisma.LembreteSelect;

export async function listarPainel(filtro: FiltroPainel) {
  const periodo = intervaloDoPeriodo(filtro.de, filtro.ate);
  const noPeriodo: Prisma.LembreteWhereInput = periodo ? { inicioConsulta: periodo } : {};
  const where: Prisma.LembreteWhereInput = filtro.situacao.length
    ? { ...noPeriodo, status: { in: filtro.situacao } }
    : noPeriodo;

  const [itens, total, grupos] = await prisma.$transaction([
    prisma.lembrete.findMany({
      where,
      select: camposPainel,
      orderBy: [{ inicioConsulta: 'asc' }, { id: 'asc' }],
      skip: (filtro.pagina - 1) * filtro.tamanhoPagina,
      take: filtro.tamanhoPagina,
    }),
    prisma.lembrete.count({ where }),
    // Contagem por situação dentro do período, sem o filtro de situação: alimenta os filtros da tela.
    prisma.lembrete.groupBy({ by: ['status'], where: noPeriodo, orderBy: { status: 'asc' }, _count: { _all: true } }),
  ]);

  const contagem = Object.fromEntries(SITUACOES.map((s) => [s, 0])) as Record<StatusLembrete, number>;
  for (const grupo of grupos) contagem[grupo.status] = grupo._count._all;
  return { itens, total, pagina: filtro.pagina, tamanhoPagina: filtro.tamanhoPagina, contagem };
}
