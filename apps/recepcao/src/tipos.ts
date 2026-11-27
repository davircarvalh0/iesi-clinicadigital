// Formato das respostas HTTP dos serviços (não confundir com os eventos do barramento).

/** US-28: confirmada, concluida e falta vêm do acompanhamento da consulta. */
export type StatusConsulta = 'agendada' | 'cancelada' | 'confirmada' | 'concluida' | 'falta';
export type StatusLembrete =
  | 'programado' | 'enviando' | 'enviado' | 'simulado' | 'aceito_provedor' | 'falhou' | 'cancelado' | 'bloqueado' | 'incerto';

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
  /** US-15: quando a recepção manteve um envio incerto sem reenvio. */
  incertoResolvidoEm: string | null;
  atualizadoEm: string;
}

export interface PaginaLembretes {
  itens: ItemPainelLembrete[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
  contagem: Record<StatusLembrete, number>;
}

export type ResultadoTentativa = 'em_andamento' | 'simulado' | 'aceito_provedor' | 'falhou' | 'indeterminado';

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

/** Decisão da recepção sobre um envio incerto (US-15). */
export interface ResolucaoEnvio {
  id: string;
  acao: 'reenviar' | 'manter_sem_reenvio';
  solicitante: string;
  registradaEm: string;
}

/** GET /lembretes/:idConsulta/trilha (US-13): sem nome, CPF ou telefone do paciente. */
export interface TrilhaLembrete {
  lembrete: Pick<Lembrete, 'id' | 'idConsulta' | 'status' | 'enviarEm' | 'enviadoEm' | 'tentativas' | 'motivoFalha' | 'modoEnvio' | 'canalEnvio' | 'idExterno'>
    & { inicioConsulta: string; idEventoConsulta: string | null; incertoResolvidoEm: string | null };
  tentativas: TentativaEnvio[];
  atividades: { id: string; acao: string; descricao: string; idEvento: string | null; ocorridoEm: string }[];
  resolucoes: ResolucaoEnvio[];
}

/** GET /envio/configuracao (US-15): modo de envio explícito, sem credenciais nem telefones. */
export interface ConfiguracaoEnvio {
  modo: 'real' | 'simulado';
  canal: 'log' | 'whatsapp';
  motivo: string;
  destinosPermitidos: number | 'todos' | null;
  antecedenciaMinutos: number;
  modoAntecedencia: 'normal' | 'demonstracao';
  maxTentativas: number;
}
