// Formato das respostas HTTP dos serviços (não confundir com os eventos do barramento).

export type StatusConsulta = 'agendada' | 'cancelada';
export type StatusLembrete = 'programado' | 'enviado' | 'falhou' | 'cancelado';

export interface Consulta {
  id: string;
  pacienteNome: string;
  pacienteCpf: string;
  pacienteTelefone: string;
  profissional: string;
  especialidade: string;
  inicio: string;
  status: StatusConsulta;
}

export interface Lembrete {
  id: string;
  idConsulta: string;
  status: StatusLembrete;
  enviarEm: string;
  enviadoEm: string | null;
  motivoFalha: string | null;
}

export interface NovaConsulta {
  nome: string;
  cpf: string;
  telefone: string;
  profissional: string;
  especialidade: string;
  /** ISO 8601 com fuso. */
  inicio: string;
}

/** Linha da outbox do Agendamento (GET /eventos). */
export interface EventoPublicado {
  id: string;
  idEvento: string;
  tipo: string;
  duplicado: boolean;
  criadoEm: string;
  publicadoEm: string | null;
  idConsulta: string;
  pacienteNome: string;
  inicio: string;
}

/** O que a Notificação fez (GET /atividades). */
export interface Atividade {
  id: string;
  acao: string;
  descricao: string;
  idEvento: string | null;
  idConsulta: string | null;
  ocorridoEm: string;
}

export interface EstadoConsumo {
  consumindo: boolean;
  naFila: number;
}
