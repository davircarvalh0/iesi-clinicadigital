import type { EnvelopeEvento } from './envelope';

// Eventos nunca carregam conteúdo clínico: só identificadores e dados de contato (LGPD).

export const TIPOS_CONSULTA = ['consulta.agendada', 'consulta.reagendada', 'consulta.cancelada'] as const;
export type TipoEventoConsulta = (typeof TIPOS_CONSULTA)[number];

export interface PacienteContato {
  cpf: string;
  nome: string;
  telefone: string;
}

export interface PayloadConsulta {
  id_consulta: string;
  paciente: PacienteContato;
  profissional: string;
  especialidade: string;
  /** ISO 8601. */
  inicio: string;
}

export type ConsultaAgendada = EnvelopeEvento<'consulta.agendada', PayloadConsulta>;
export type ConsultaReagendada = EnvelopeEvento<'consulta.reagendada', PayloadConsulta>;
export type ConsultaCancelada = EnvelopeEvento<'consulta.cancelada', PayloadConsulta>;
export type EventoConsulta = ConsultaAgendada | ConsultaReagendada | ConsultaCancelada;

export function idCorrelacaoConsulta(idConsulta: string): string {
  return `consulta-${idConsulta}`;
}

export function ehEventoConsulta(valor: unknown): valor is EventoConsulta {
  const e = valor as EventoConsulta | null;
  return !!e && typeof e.id_evento === 'string' && TIPOS_CONSULTA.includes(e.tipo);
}
