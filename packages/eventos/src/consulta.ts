import type { EnvelopeEvento } from './envelope';
import { ehCpf, ehDataValida, ehObjeto, ehTelefone, ehTextoPreenchido, motivoEnvelope, type Validacao } from './validacao';

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
  /**
   * US-11: campo aditivo, inteiro positivo, incrementado a cada alteração da consulta
   * (agendamento = 1, remarcação e cancelamento incrementam). Permite ao consumidor
   * descartar eventos fora de ordem. Eventos publicados antes desta versão não o têm;
   * nesse caso o consumidor aplica o evento normalmente, sem checagem de ordem.
   */
  sequencia?: number;
}

export type ConsultaAgendada = EnvelopeEvento<'consulta.agendada', PayloadConsulta>;
export type ConsultaReagendada = EnvelopeEvento<'consulta.reagendada', PayloadConsulta>;
export type ConsultaCancelada = EnvelopeEvento<'consulta.cancelada', PayloadConsulta>;
export type EventoConsulta = ConsultaAgendada | ConsultaReagendada | ConsultaCancelada;

export function idCorrelacaoConsulta(idConsulta: string): string {
  return `consulta-${idConsulta}`;
}

export function validarEventoConsulta(valor: unknown): Validacao<EventoConsulta> {
  const motivo = motivoEnvelope(valor, TIPOS_CONSULTA, 'agendamento');
  if (motivo) return { ok: false, motivo };
  const p = (valor as { payload: Record<string, unknown> }).payload;
  const paciente = p.paciente as Record<string, unknown> | undefined;
  if (!ehTextoPreenchido(p.id_consulta)) return { ok: false, motivo: 'payload.id_consulta ausente' };
  if (!ehObjeto(paciente)) return { ok: false, motivo: 'payload.paciente ausente' };
  if (!ehCpf(paciente.cpf)) return { ok: false, motivo: 'payload.paciente.cpf inválido' };
  if (!ehTextoPreenchido(paciente.nome, 3)) return { ok: false, motivo: 'payload.paciente.nome inválido' };
  if (!ehTelefone(paciente.telefone)) return { ok: false, motivo: 'payload.paciente.telefone inválido' };
  if (!ehTextoPreenchido(p.profissional)) return { ok: false, motivo: 'payload.profissional ausente' };
  if (!ehTextoPreenchido(p.especialidade)) return { ok: false, motivo: 'payload.especialidade ausente' };
  if (!ehDataValida(p.inicio)) return { ok: false, motivo: 'payload.inicio inválido' };
  if (p.sequencia !== undefined && (!Number.isSafeInteger(p.sequencia) || (p.sequencia as number) < 1)) {
    return { ok: false, motivo: 'payload.sequencia inválida' };
  }
  return { ok: true, evento: valor as EventoConsulta };
}

export function ehEventoConsulta(valor: unknown): valor is EventoConsulta {
  return validarEventoConsulta(valor).ok;
}