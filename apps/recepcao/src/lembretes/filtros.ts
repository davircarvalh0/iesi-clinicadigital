// Regras puras da tela de lembretes (US-09), testadas em test/lembretes.test.ts.
import { chaveDiaDaqui } from '../formatacao';
import type { StatusLembrete } from '../tipos';

export type Periodo = 'hoje' | 'proximos7' | 'ultimos7' | 'todos';

export const NOME_PERIODO: Record<Periodo, string> = {
  hoje: 'Hoje',
  proximos7: 'Próximos 7 dias',
  ultimos7: 'Últimos 7 dias',
  todos: 'Todos',
};

export interface FiltroLembretes {
  periodo: Periodo;
  situacoes: StatusLembrete[];
  pagina: number;
}

/** Dias civis em America/Recife, pela data de início da consulta. */
export function intervaloDoPeriodo(periodo: Periodo, daqui = chaveDiaDaqui): { de?: string; ate?: string } {
  if (periodo === 'hoje') return { de: daqui(0), ate: daqui(0) };
  if (periodo === 'proximos7') return { de: daqui(0), ate: daqui(6) };
  if (periodo === 'ultimos7') return { de: daqui(-6), ate: daqui(0) };
  return {};
}

export const TAMANHO_PAGINA = 20;

/** Query string de GET /lembretes/painel. */
export function consultaDoFiltro(filtro: FiltroLembretes, daqui = chaveDiaDaqui): string {
  const { de, ate } = intervaloDoPeriodo(filtro.periodo, daqui);
  const params = new URLSearchParams();
  if (filtro.situacoes.length) params.set('situacao', [...filtro.situacoes].sort().join(','));
  if (de) params.set('de', de);
  if (ate) params.set('ate', ate);
  params.set('pagina', String(filtro.pagina));
  params.set('tamanhoPagina', String(TAMANHO_PAGINA));
  return params.toString();
}

/** Marca ou desmarca uma situação; qualquer mudança de filtro volta para a página 1. */
export function alternarSituacao(filtro: FiltroLembretes, situacao: StatusLembrete): FiltroLembretes {
  const situacoes = filtro.situacoes.includes(situacao)
    ? filtro.situacoes.filter((s) => s !== situacao)
    : [...filtro.situacoes, situacao];
  return { ...filtro, situacoes, pagina: 1 };
}

export const totalDePaginas = (total: number, tamanho = TAMANHO_PAGINA) => Math.max(1, Math.ceil(total / tamanho));
