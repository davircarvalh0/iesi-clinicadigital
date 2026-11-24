export type Validacao<T> = { ok: true; evento: T } | { ok: false; motivo: string };

export const VERSOES_SUPORTADAS: Readonly<Record<string, readonly number[]>> = {
  'consulta.agendada': [1],
  'consulta.reagendada': [1],
  'consulta.cancelada': [1],
  'paciente.atualizado': [1],
};

type Objeto = Record<string, unknown>;

export const ehObjeto = (v: unknown): v is Objeto => !!v && typeof v === 'object' && !Array.isArray(v);
export const ehTextoPreenchido = (v: unknown, minimo = 1): v is string =>
  typeof v === 'string' && v.trim().length >= minimo;
export const ehDataValida = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
export const ehCpf = (v: unknown): v is string => typeof v === 'string' && /^\d{11}$/.test(v);
export const ehTelefone = (v: unknown): v is string => typeof v === 'string' && /^\d{10,13}$/.test(v);

// Campos extras são aceitos (evolução aditiva). O motivo nunca inclui dados pessoais.
export function motivoEnvelope(valor: unknown, tipos: readonly string[], origem: string): string | null {
  if (!ehObjeto(valor)) return 'mensagem não é um objeto JSON';
  if (!ehTextoPreenchido(valor.id_evento)) return 'id_evento ausente';
  if (typeof valor.tipo !== 'string' || !tipos.includes(valor.tipo)) return `tipo não suportado: ${String(valor.tipo)}`;
  const versoes = VERSOES_SUPORTADAS[valor.tipo] ?? [];
  if (typeof valor.versao !== 'number' || !versoes.includes(valor.versao)) {
    return `versão ${String(valor.versao)} não suportada para ${valor.tipo}`;
  }
  if (valor.origem !== origem) return `origem inesperada para ${valor.tipo}`;
  if (!ehTextoPreenchido(valor.id_correlacao)) return 'id_correlacao ausente';
  if (!ehDataValida(valor.ocorrido_em)) return 'ocorrido_em inválido';
  if (!ehObjeto(valor.payload)) return 'payload ausente';
  return null;
}