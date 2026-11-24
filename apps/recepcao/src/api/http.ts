export class ErroApi extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

export async function requisitar<T>(url: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(url, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...opcoes.headers },
  });
  const corpo = resposta.status === 204 ? null : await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new ErroApi(resposta.status, corpo?.erro ?? `Erro ${resposta.status}`);
  }
  return corpo as T;
}
