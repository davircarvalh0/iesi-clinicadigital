/**
 * Quanto a tela pode confiar num dado que veio de um serviço (US-18).
 * - carregando: ainda não houve resposta;
 * - atual: a última leitura deu certo e é recente;
 * - atrasado: nenhuma falha, mas a última resposta boa já passou do limite;
 * - desatualizado: o serviço falhou e o que está na tela é de uma leitura anterior;
 * - indisponivel: o serviço falhou e nunca respondeu; a situação é desconhecida.
 */
export type Frescor = 'carregando' | 'atual' | 'atrasado' | 'desatualizado' | 'indisponivel';

export interface Leitura {
  temDados: boolean;
  temErro: boolean;
  atualizadoEm: number;
}

export function frescorDe({ temDados, temErro, atualizadoEm }: Leitura, agora: number, limiteMs: number): Frescor {
  if (!temDados) return temErro ? 'indisponivel' : 'carregando';
  if (temErro) return 'desatualizado';
  return agora - atualizadoEm > limiteMs ? 'atrasado' : 'atual';
}

/** Não dá para afirmar nada: sem dado nenhum. */
export const desconhecido = (f: Frescor) => f === 'carregando' || f === 'indisponivel';
/** Há dado, mas pode não refletir o momento. */
export const velho = (f: Frescor) => f === 'atrasado' || f === 'desatualizado';
