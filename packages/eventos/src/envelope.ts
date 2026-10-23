import { randomUUID } from 'node:crypto';

/** Envelope padrão de todo evento publicado no barramento. */
export interface EnvelopeEvento<TTipo extends string = string, TPayload = unknown> {
  id_evento: string;
  tipo: TTipo;
  versao: number;
  origem: string;
  /** ISO 8601 com fuso -03:00. */
  ocorrido_em: string;
  id_correlacao: string;
  payload: TPayload;
}

/** Formata uma data em ISO 8601 no fuso de Recife (-03:00, sem horário de verão). */
export function isoRecife(data: Date = new Date()): string {
  const local = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().replace('Z', '-03:00');
}

export function criarEnvelope<TTipo extends string, TPayload>(dados: {
  tipo: TTipo;
  origem: string;
  id_correlacao: string;
  payload: TPayload;
  versao?: number;
}): EnvelopeEvento<TTipo, TPayload> {
  return {
    id_evento: randomUUID(),
    tipo: dados.tipo,
    versao: dados.versao ?? 1,
    origem: dados.origem,
    ocorrido_em: isoRecife(),
    id_correlacao: dados.id_correlacao,
    payload: dados.payload,
  };
}
