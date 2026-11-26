// Formato das respostas HTTP dos serviços (não confundir com os eventos do barramento).

export type StatusConsulta = 'agendada' | 'cancelada';
export type StatusLembrete =
  | 'programado' | 'enviando' | 'enviado' | 'simulado' | 'aceito_provedor' | 'falhou' | 'cancelado' | 'bloqueado';

export interface Consulta {
  id: string;
  idPaciente: string | null;
  vinculoPacientePendente: boolean;
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
  /** Início da consulta que a Notificação conhece; difere da agenda enquanto a remarcação não chega. */
  inicioConsulta?: string;
  enviarEm: string;
  antecedenciaMinutos: number | null;
  enviadoEm: string | null;
  modoEnvio: 'simulado' | 'real' | null;
  canalEnvio: 'log' | 'whatsapp' | null;
  idExterno: string | null;
  tentativas: number;
  motivoFalha: string | null;
}

export interface NovaConsulta {
  idPaciente?: string;
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

/** Item de GET /lembretes/painel (US-09): sem CPF e sem telefone. */
export interface ItemPainelLembrete {
  id: string;
  idConsulta: string;
  pacienteNome: string;
  profissional: string;
  especialidade: string;
  inicioConsulta: string;
  enviarEm: string;
  antecedenciaMinutos: number | null;
  status: StatusLembrete;
  tentativas: number;
  motivoFalha: string | null;
  enviadoEm: string | null;
  modoEnvio: 'simulado' | 'real' | null;
  canalEnvio: 'log' | 'whatsapp' | null;
  idExterno: string | null;
  atualizadoEm: string;
}

export interface PaginaLembretes {
  itens: ItemPainelLembrete[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
  contagem: Record<StatusLembrete, number>;
}

export type ResultadoTentativa = 'em_andamento' | 'simulado' | 'aceito_provedor' | 'falhou';

/** Uma chamada ao canal de envio (US-13). */
export interface TentativaEnvio {
  id: string;
  numero: number;
  idEventoConsulta: string | null;
  canal: 'log' | 'whatsapp';
  modo: 'simulado' | 'real';
  resultado: ResultadoTentativa;
  idExterno: string | null;
  motivo: string | null;
  iniciadaEm: string;
  concluidaEm: string | null;
}

/** GET /lembretes/:idConsulta/trilha (US-13): sem nome, CPF ou telefone. */
export interface TrilhaLembrete {
  lembrete: Pick<Lembrete, 'id' | 'idConsulta' | 'status' | 'enviarEm' | 'enviadoEm' | 'tentativas' | 'motivoFalha' | 'modoEnvio' | 'canalEnvio' | 'idExterno'>
    & { inicioConsulta: string; idEventoConsulta: string | null };
  tentativas: TentativaEnvio[];
  atividades: { id: string; acao: string; descricao: string; idEvento: string | null; ocorridoEm: string }[];
}
