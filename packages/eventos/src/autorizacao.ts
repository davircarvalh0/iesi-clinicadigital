import type { EnvelopeEvento } from './envelope';
import { ehCpf, ehDataValida, ehTextoPreenchido, motivoEnvelope, type Validacao } from './validacao';

/** Canais pelos quais o paciente pode autorizar contato. */
export const CANAIS_CONTATO = ['whatsapp', 'sms', 'email'] as const;
export type CanalContato = (typeof CANAIS_CONTATO)[number];

export const SITUACOES_AUTORIZACAO = ['autorizado', 'revogado'] as const;
export type SituacaoAutorizacao = (typeof SITUACOES_AUTORIZACAO)[number];

/** Como a autorização ou revogação chegou à clínica. */
export const ORIGENS_AUTORIZACAO = ['presencial', 'telefone', 'formulario'] as const;
export type OrigemAutorizacao = (typeof ORIGENS_AUTORIZACAO)[number];

/**
 * Um registro de autorização ou revogação de um canal. `versao` cresce por paciente e canal:
 * consumidores só aplicam versão maior que a guardada. Sem dados clínicos e sem contato.
 */
export interface PayloadAutorizacaoContato {
  id_paciente: string;
  cpf: string;
  canal: CanalContato;
  situacao: SituacaoAutorizacao;
  origem_registro: OrigemAutorizacao;
  /** ISO 8601: quando a clínica registrou a decisão do paciente. */
  registrado_em: string;
  versao: number;
}

export type AutorizacaoContatoAlterada = EnvelopeEvento<'paciente.autorizacao_alterada', PayloadAutorizacaoContato>;

const pertence = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === 'string' && lista.includes(v as T);

export function validarAutorizacaoContato(valor: unknown): Validacao<AutorizacaoContatoAlterada> {
  const motivo = motivoEnvelope(valor, ['paciente.autorizacao_alterada'], 'cadastro');
  if (motivo) return { ok: false, motivo };
  const p = (valor as { payload: Record<string, unknown> }).payload;
  if (!ehTextoPreenchido(p.id_paciente)) return { ok: false, motivo: 'payload.id_paciente ausente' };
  if (!ehCpf(p.cpf)) return { ok: false, motivo: 'payload.cpf inválido' };
  if (!pertence(CANAIS_CONTATO, p.canal)) return { ok: false, motivo: 'payload.canal inválido' };
  if (!pertence(SITUACOES_AUTORIZACAO, p.situacao)) return { ok: false, motivo: 'payload.situacao inválida' };
  if (!pertence(ORIGENS_AUTORIZACAO, p.origem_registro)) return { ok: false, motivo: 'payload.origem_registro inválida' };
  if (!ehDataValida(p.registrado_em)) return { ok: false, motivo: 'payload.registrado_em inválido' };
  if (!Number.isSafeInteger(p.versao) || (p.versao as number) <= 0) return { ok: false, motivo: 'payload.versao inválida' };
  return { ok: true, evento: valor as AutorizacaoContatoAlterada };
}

export function ehAutorizacaoContato(valor: unknown): valor is AutorizacaoContatoAlterada {
  return validarAutorizacaoContato(valor).ok;
}
