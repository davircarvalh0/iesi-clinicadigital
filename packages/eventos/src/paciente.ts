import type { EnvelopeEvento } from './envelope';

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

export function ehPacienteAtualizado(valor: unknown): valor is PacienteAtualizado {
  if (!valor || typeof valor !== 'object') return false;
  const e = valor as Partial<PacienteAtualizado>;
  const p = e.payload;
  return e.tipo === 'paciente.atualizado' && e.versao === 1 &&
    typeof e.id_evento === 'string' && !!e.id_evento &&
    e.origem === 'cadastro' && typeof e.id_correlacao === 'string' && !!e.id_correlacao &&
    typeof e.ocorrido_em === 'string' && Number.isFinite(Date.parse(e.ocorrido_em)) &&
    !!p && typeof p.id_paciente === 'string' && !!p.id_paciente &&
    typeof p.cpf === 'string' && /^\d{11}$/.test(p.cpf) &&
    typeof p.nome === 'string' && p.nome.trim().length >= 3 &&
    typeof p.telefone === 'string' && /^\d{10,13}$/.test(p.telefone) &&
    (p.email === null || typeof p.email === 'string') &&
    Number.isSafeInteger(p.revisao) && p.revisao > 0;
}
