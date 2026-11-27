import type { EnvelopeEvento } from './envelope';
import { ehDataValida, ehTextoPreenchido, motivoEnvelope, type Validacao } from './validacao';

/**
 * US-30: o paciente confirmou presença respondendo ao lembrete no WhatsApp.
 * Publicado pela Notificação; o Agendamento, dono da consulta, aplica a confirmação.
 * Sem telefone nem texto da mensagem: só o identificador da consulta (LGPD).
 */
export interface PayloadConsultaConfirmada {
  id_consulta: string;
  canal: 'whatsapp';
  /** ISO 8601: quando a resposta do paciente chegou. */
  confirmada_em: string;
  sequencia?: number;
}

export type ConsultaConfirmada = EnvelopeEvento<'consulta.confirmada', PayloadConsultaConfirmada>;

export function validarConsultaConfirmada(valor: unknown): Validacao<ConsultaConfirmada> {
  const motivo = motivoEnvelope(valor, ['consulta.confirmada'], 'notificacao');
  if (motivo) return { ok: false, motivo };
  const p = (valor as { payload: Record<string, unknown> }).payload;
  if (!ehTextoPreenchido(p.id_consulta)) return { ok: false, motivo: 'payload.id_consulta ausente' };
  if (p.canal !== 'whatsapp') return { ok: false, motivo: 'payload.canal inválido' };
  if (!ehDataValida(p.confirmada_em)) return { ok: false, motivo: 'payload.confirmada_em inválido' };
  if (p.sequencia !== undefined && (typeof p.sequencia !== 'number' || !Number.isInteger(p.sequencia) || p.sequencia < 1)) return { ok: false, motivo: 'payload.sequencia inválida' };
  return { ok: true, evento: valor as ConsultaConfirmada };
}
