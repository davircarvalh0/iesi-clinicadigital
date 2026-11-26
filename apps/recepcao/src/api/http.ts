export class ErroApi extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

/** Sem resposta neste prazo, a requisição é abortada (uma consulta presa não pode travar o polling). */
export const TIMEOUT_PADRAO_MS = 8000;
let token: string | null = null;
export function definirToken(valor: string | null) { token = valor; }

export async function requisitar<T>(url: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(url, {
    ...opcoes,
    signal: opcoes.signal ?? AbortSignal.timeout(TIMEOUT_PADRAO_MS),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opcoes.headers },
  });
  const corpo = resposta.status === 204 ? null : await resposta.json().catch(() => null);
  if (!resposta.ok) {
    if (resposta.status === 401 && token) { definirToken(null); window.dispatchEvent(new Event('sessao-expirada')); }
    throw new ErroApi(resposta.status, corpo?.erro ?? `Erro ${resposta.status}`);
  }
  return corpo as T;
}

/**
 * - `recusada`: o serviço respondeu e não aplicou a operação (validação, conflito, erro interno com rollback).
 * - `incerta`: sem resposta do serviço (rede, tempo esgotado, gateway). A gravação pode ter acontecido.
 */
export type TipoFalha = 'recusada' | 'incerta';

export function classificarFalha(erro: unknown): TipoFalha {
  if (erro instanceof ErroApi) return erro.status === 502 || erro.status === 504 ? 'incerta' : 'recusada';
  return 'incerta';
}

/** Motivo legível de uma falha (as mensagens do navegador para rede e timeout são técnicas). */
export function motivoDaFalha(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.message;
  if (erro instanceof DOMException && erro.name === 'TimeoutError') return `sem resposta em ${TIMEOUT_PADRAO_MS / 1000} s`;
  return 'sem conexão com o serviço';
}

/**
 * Texto para a recepção. Uma falha incerta nunca é apresentada como "não feito" nem como "feito".
 * `acao` vem com artigo: "o cancelamento", "a remarcação".
 */
export function descreverFalha(erro: unknown, acao: string): string {
  if (classificarFalha(erro) === 'incerta') {
    return `Sem resposta do serviço: não foi possível confirmar se ${acao} aconteceu. Confira a agenda atualizada antes de repetir.`;
  }
  return `Não foi possível concluir ${acao}: ${motivoDaFalha(erro)}.`;
}
