/** Erro com resposta do serviço: o serviço recebeu o pedido e respondeu com um código de falha. */
export class ErroApi extends Error {
  constructor(public readonly status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

export const PRAZO_PADRAO_MS = 8000;

let tokenAtual: string | null = null;
let aoExpirar: (() => void) | null = null;

export function configurarSessao(token: string | null, expirou?: () => void) {
  tokenAtual = token;
  if (expirou) aoExpirar = expirou;
}

interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corpo?: unknown;
  sinal?: AbortSignal;
  prazoMs?: number;
}

/** Chamada a /api/<serviço>/… com o token da sessão e prazo máximo de resposta. */
export async function chamar<T>(caminho: string, { metodo = 'GET', corpo, sinal, prazoMs = PRAZO_PADRAO_MS }: Opcoes = {}): Promise<T> {
  const prazo = AbortSignal.timeout(prazoMs);
  const resposta = await fetch(caminho, {
    method: metodo,
    cache: 'no-store',
    signal: sinal ? AbortSignal.any([sinal, prazo]) : prazo,
    headers: {
      ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(tokenAtual ? { Authorization: `Bearer ${tokenAtual}` } : {}),
    },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const dados = resposta.status === 204 ? null : await resposta.json().catch(() => null);
  if (!resposta.ok) {
    if (resposta.status === 401 && tokenAtual) aoExpirar?.();
    const mensagem = typeof dados?.erro === 'string' ? dados.erro : mensagemPadrao(resposta.status);
    throw new ErroApi(resposta.status, mensagem);
  }
  return dados as T;
}

function mensagemPadrao(status: number): string {
  if (status === 403) return 'Seu perfil não tem acesso a esta informação.';
  if (status === 404) return 'Não encontrado.';
  if (status === 429) return 'Muitas tentativas seguidas. Aguarde um pouco.';
  if (status >= 500) return 'O serviço encontrou um erro interno.';
  return `Erro ${status}`;
}

/**
 * Uma operação de escrita que falha pode ter dois significados diferentes para a recepção:
 * - `recusada`: o serviço respondeu e não aplicou a operação;
 * - `incerta`: não houve resposta (rede, prazo, gateway), então a gravação pode ter acontecido.
 */
export type TipoFalha = 'recusada' | 'incerta';

export function tipoDaFalha(erro: unknown): TipoFalha {
  if (erro instanceof ErroApi) return erro.status === 502 || erro.status === 503 || erro.status === 504 ? 'incerta' : 'recusada';
  return 'incerta';
}

/** Motivo curto e legível, sem jargão do navegador. */
export function motivo(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.message;
  if (erro instanceof DOMException && (erro.name === 'TimeoutError' || erro.name === 'AbortError')) return 'o serviço não respondeu a tempo';
  return 'sem conexão com o serviço';
}

export const statusDe = (erro: unknown): number | null => (erro instanceof ErroApi ? erro.status : null);
