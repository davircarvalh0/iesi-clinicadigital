import type { EnvelopeEvento } from './envelope';
import { ehCpf, ehTelefone, ehTextoPreenchido, motivoEnvelope, type Validacao } from './validacao';

/** Contato mínimo para sincronizar cópias locais; nunca inclui dados clínicos. */
export interface PayloadPacienteAtualizado {
  id_paciente: string;
  cpf: string;
  nome: string;
  telefone: string;
  email: string | null;
  revisao: number;
}

export type PacienteAtualizado = EnvelopeEvento<'paciente.atualizado', PayloadPacienteAtualizado>;

export function validarPacienteAtualizado(valor: unknown): Validacao<PacienteAtualizado> {
  const motivo = motivoEnvelope(valor, ['paciente.atualizado'], 'cadastro');
  if (motivo) return { ok: false, motivo };
  const p = (valor as { payload: Record<string, unknown> }).payload;
  if (!ehTextoPreenchido(p.id_paciente)) return { ok: false, motivo: 'payload.id_paciente ausente' };
  if (!ehCpf(p.cpf)) return { ok: false, motivo: 'payload.cpf inválido' };
  if (!ehTextoPreenchido(p.nome, 3)) return { ok: false, motivo: 'payload.nome inválido' };
  if (!ehTelefone(p.telefone)) return { ok: false, motivo: 'payload.telefone inválido' };
  if (p.email !== null && typeof p.email !== 'string') return { ok: false, motivo: 'payload.email inválido' };
  if (!Number.isSafeInteger(p.revisao) || (p.revisao as number) <= 0) return { ok: false, motivo: 'payload.revisao inválida' };
  return { ok: true, evento: valor as PacienteAtualizado };
}

export function ehPacienteAtualizado(valor: unknown): valor is PacienteAtualizado {
  return validarPacienteAtualizado(valor).ok;
}