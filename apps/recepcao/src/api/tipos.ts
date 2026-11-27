// Formatos das respostas HTTP dos serviços, conforme docs/contratos.md.

export type Perfil = 'administrador' | 'recepcionista' | 'profissional';

export interface Usuario {
  id: string;
  nome: string;
  perfil: Perfil;
  profissionalId: string | null;
}

export interface UsuarioListado extends Usuario {
  email: string;
}

export interface Profissional {
  id: string;
  nome: string;
  especialidade: string;
}

// ---------- Agendamento ----------

export type StatusConsulta = 'agendada' | 'confirmada' | 'concluida' | 'falta' | 'cancelada';

export interface Consulta {
  id: string;
  idPaciente: string | null;
  vinculoPacientePendente: boolean;
  pacienteNome: string;
  pacienteCpf: string;
  pacienteTelefone: string;
  profissional: string;
  especialidade: string;
  /** ISO 8601 com fuso. */
  inicio: string;
  status: StatusConsulta;
}

export interface DadosNovaConsulta {
  idPaciente?: string;
  nome: string;
  cpf: string;
  telefone: string;
  profissional: string;
  especialidade: string;
  inicio: string;
}

/** Linha da outbox (GET /eventos): sem CPF nem telefone. */
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

// ---------- Cadastro ----------

export type Canal = 'whatsapp' | 'sms' | 'email';
export type OrigemAutorizacao = 'presencial' | 'telefone' | 'formulario';

export interface Paciente {
  id: string;
  cpf: string;
  nome: string;
  telefone: string;
  email: string | null;
  revisao: number;
}

export interface Autorizacao {
  canal: Canal;
  /** `sem_registro` não é autorização. */
  situacao: 'autorizado' | 'revogado' | 'sem_registro';
  origem: OrigemAutorizacao | null;
  registradoEm: string | null;
  versao: number;
}

export interface PacienteDetalhado extends Paciente {
  nascimento: string | null;
  convenio: string | null;
  canalPreferido: Canal | null;
  autorizacoes: Autorizacao[];
}

export interface PaginaPacientes {
  pacientes: Paciente[];
  total: number;
  totalFiltrado: number;
  pagina: number;
  tamanhoPagina: number;
}

export type EdicaoPaciente = Pick<PacienteDetalhado, 'telefone' | 'email' | 'nascimento' | 'convenio' | 'canalPreferido' | 'revisao'>;

// ---------- Notificação ----------

export type StatusLembrete =
  | 'programado' | 'enviando' | 'simulado' | 'aceito_provedor' | 'falhou'
  | 'bloqueado' | 'incerto' | 'cancelado' | 'enviado';

export type ModoEnvio = 'simulado' | 'real';
export type CanalEnvio = 'log' | 'whatsapp';

export interface Lembrete {
  id: string;
  idConsulta: string;
  status: StatusLembrete;
  /** Início da consulta que a Notificação conhece; difere da agenda enquanto a remarcação não chega. */
  inicioConsulta?: string;
  enviarEm: string;
  antecedenciaMinutos: number | null;
  enviadoEm: string | null;
  modoEnvio: ModoEnvio | null;
  canalEnvio: CanalEnvio | null;
  idExterno: string | null;
  tentativas: number;
  motivoFalha: string | null;
}

/** Item de GET /lembretes/painel: sem CPF e sem telefone. */
export interface LembreteNoPainel {
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
  modoEnvio: ModoEnvio | null;
  canalEnvio: CanalEnvio | null;
  idExterno: string | null;
  incertoResolvidoEm: string | null;
  atualizadoEm: string;
}

export interface PaginaLembretes {
  itens: LembreteNoPainel[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
  contagem: Partial<Record<StatusLembrete, number>>;
}

export type ResultadoTentativa = 'em_andamento' | 'simulado' | 'aceito_provedor' | 'falhou' | 'indeterminado';

export interface Tentativa {
  id: string;
  numero: number;
  idEventoConsulta: string | null;
  canal: CanalEnvio;
  modo: ModoEnvio;
  resultado: ResultadoTentativa;
  idExterno: string | null;
  motivo: string | null;
  iniciadaEm: string;
  concluidaEm: string | null;
}

export interface Resolucao {
  id: string;
  acao: 'reenviar' | 'manter_sem_reenvio';
  solicitante: string;
  registradaEm: string;
}

export interface Trilha {
  lembrete: {
    id: string;
    idConsulta: string;
    status: StatusLembrete;
    enviarEm: string;
    enviadoEm: string | null;
    tentativas: number;
    motivoFalha: string | null;
    modoEnvio: ModoEnvio | null;
    canalEnvio: CanalEnvio | null;
    idExterno: string | null;
    inicioConsulta: string;
    idEventoConsulta: string | null;
    incertoResolvidoEm: string | null;
  };
  tentativas: Tentativa[];
  atividades: { id: string; acao: string; descricao: string; idEvento: string | null; ocorridoEm: string }[];
  resolucoes: Resolucao[];
}

export interface ConfiguracaoEnvio {
  modo: ModoEnvio;
  canal: CanalEnvio;
  motivo: string;
  destinosPermitidos: number | 'todos' | null;
  antecedenciaMinutos: number;
  modoAntecedencia: 'normal' | 'demonstracao';
  maxTentativas: number;
}

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

export interface ErroNaFila {
  idEvento: string | null;
  tipo: string | null;
  motivo: string;
  tentativas: number;
  reprocessavel: boolean;
  jaProcessado: boolean;
}

export interface Reprocessamento {
  id: string;
  idEvento: string;
  solicitante: string;
  resultado: string;
  solicitadoEm: string;
}
