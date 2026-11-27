import { chamar } from './cliente';
import type {
  Atividade, Autorizacao, Canal, ConfiguracaoEnvio, Consulta, DadosNovaConsulta, Disponibilidade, EdicaoPaciente,
  ErroNaFila, EstadoConsumo, EventoPublicado, IntervaloDisponibilidade, Lembrete, OrigemAutorizacao, PacienteDetalhado,
  PaginaLembretes, PaginaPacientes, Perfil, Profissional, Reprocessamento, Trilha, Usuario, UsuarioListado,
} from './tipos';

const id = encodeURIComponent;

export const acesso = {
  entrar: (email: string, senha: string) =>
    chamar<{ usuario: Usuario; token: string }>('/api/cadastro/usuarios/login', { metodo: 'POST', corpo: { email, senha } }),
};

export const agendamento = {
  consultas: (sinal?: AbortSignal) => chamar<Consulta[]>('/api/agendamento/consultas', { sinal }),
  agendar: (dados: DadosNovaConsulta) => chamar<Consulta>('/api/agendamento/consultas', { metodo: 'POST', corpo: dados, prazoMs: 10_000 }),
  remarcar: (idConsulta: string, inicio: string) =>
    chamar<Consulta>(`/api/agendamento/consultas/${id(idConsulta)}`, { metodo: 'PATCH', corpo: { inicio }, prazoMs: 10_000 }),
  cancelar: (idConsulta: string) =>
    chamar<Consulta>(`/api/agendamento/consultas/${id(idConsulta)}`, { metodo: 'DELETE', prazoMs: 10_000 }),
  profissionais: (sinal?: AbortSignal) => chamar<Profissional[]>('/api/agendamento/profissionais', { sinal }),
  cadastrarProfissional: (dados: { nome: string; especialidade: string }) =>
    chamar<Profissional>('/api/agendamento/profissionais', { metodo: 'POST', corpo: dados }),
  atualizarProfissional: (idProfissional: string, dados: { nome?: string; especialidade?: string; duracaoConsultaMinutos?: number }) =>
    chamar<Profissional>(`/api/agendamento/profissionais/${id(idProfissional)}`, { metodo: 'PATCH', corpo: dados }),
  definirStatusProfissional: (idProfissional: string, ativo: boolean) =>
    chamar<Profissional>(`/api/agendamento/profissionais/${id(idProfissional)}/status`, { metodo: 'PATCH', corpo: { ativo } }),
  disponibilidade: (idProfissional: string, sinal?: AbortSignal) =>
    chamar<Disponibilidade>(`/api/agendamento/profissionais/${id(idProfissional)}/disponibilidade`, { sinal }),
  definirDisponibilidade: (idProfissional: string, intervalos: IntervaloDisponibilidade[]) =>
    chamar<Disponibilidade>(`/api/agendamento/profissionais/${id(idProfissional)}/disponibilidade`, { metodo: 'PUT', corpo: { intervalos }, prazoMs: 10_000 }),
  eventos: (sinal?: AbortSignal) => chamar<EventoPublicado[]>('/api/agendamento/eventos?limite=40', { sinal }),
  reenviarUltimoEvento: () => chamar<unknown>('/api/agendamento/demo/reenviar-ultimo-evento', { metodo: 'POST' }),
};

export const cadastro = {
  pacientes: (busca: string, pagina: number, tamanhoPagina = 20, sinal?: AbortSignal) =>
    chamar<PaginaPacientes>(`/api/cadastro/pacientes?${new URLSearchParams({ busca, pagina: String(pagina), tamanhoPagina: String(tamanhoPagina) })}`, { sinal }),
  buscarCpf: (cpf: string, sinal?: AbortSignal) =>
    chamar<{ paciente: Pick<PacienteDetalhado, 'id' | 'cpf' | 'nome' | 'telefone'> | null }>('/api/cadastro/pacientes/busca-cpf', { metodo: 'POST', corpo: { cpf }, sinal }),
  paciente: (idPaciente: string, sinal?: AbortSignal) => chamar<PacienteDetalhado>(`/api/cadastro/pacientes/${id(idPaciente)}`, { sinal }),
  atualizar: (idPaciente: string, dados: EdicaoPaciente) =>
    chamar<PacienteDetalhado>(`/api/cadastro/pacientes/${id(idPaciente)}`, { metodo: 'PATCH', corpo: dados, prazoMs: 10_000 }),
  historicoAutorizacoes: (idPaciente: string, sinal?: AbortSignal) =>
    chamar<{ historico: Autorizacao[] }>(`/api/cadastro/pacientes/${id(idPaciente)}/autorizacoes`, { sinal }),
  registrarAutorizacao: (idPaciente: string, dados: { canal: Canal; situacao: 'autorizado' | 'revogado'; origem: OrigemAutorizacao }) =>
    chamar<{ registro: Autorizacao; autorizacoes: Autorizacao[] }>(`/api/cadastro/pacientes/${id(idPaciente)}/autorizacoes`, { metodo: 'POST', corpo: dados, prazoMs: 10_000 }),
  usuarios: (sinal?: AbortSignal) => chamar<UsuarioListado[]>('/api/cadastro/usuarios', { sinal }),
  cadastrarUsuario: (dados: { nome: string; email: string; senha: string; perfil: Perfil; profissionalId?: string | null }) =>
    chamar<UsuarioListado>('/api/cadastro/usuarios', { metodo: 'POST', corpo: dados }),
};

export interface FiltroPainel {
  situacoes: string[];
  de?: string;
  ate?: string;
  pagina: number;
  tamanhoPagina: number;
}

export function consultaDoPainel(f: FiltroPainel): string {
  const p = new URLSearchParams({ pagina: String(f.pagina), tamanhoPagina: String(f.tamanhoPagina) });
  if (f.situacoes.length) p.set('situacao', f.situacoes.join(','));
  if (f.de) p.set('de', f.de);
  if (f.ate) p.set('ate', f.ate);
  return p.toString();
}

export const notificacao = {
  lembretes: (sinal?: AbortSignal) => chamar<Lembrete[]>('/api/notificacao/lembretes', { sinal }),
  painel: (filtro: FiltroPainel, sinal?: AbortSignal) => chamar<PaginaLembretes>(`/api/notificacao/lembretes/painel?${consultaDoPainel(filtro)}`, { sinal }),
  trilha: (idConsulta: string, sinal?: AbortSignal) => chamar<Trilha>(`/api/notificacao/lembretes/${id(idConsulta)}/trilha`, { sinal }),
  resolver: (idConsulta: string, acao: 'reenviar' | 'manter_sem_reenvio') =>
    chamar<unknown>(`/api/notificacao/lembretes/${id(idConsulta)}/resolucao`, { metodo: 'POST', corpo: { acao } }),
  configuracaoEnvio: (sinal?: AbortSignal) => chamar<ConfiguracaoEnvio>('/api/notificacao/envio/configuracao', { sinal }),
  autorizacoes: (idPaciente: string, sinal?: AbortSignal) =>
    chamar<{ autorizacoes: { canal: string; situacao: string; versao: number }[] }>(`/api/notificacao/autorizacoes/${id(idPaciente)}`, { sinal }),
  atividades: (sinal?: AbortSignal) => chamar<Atividade[]>('/api/notificacao/atividades?limite=40', { sinal }),
  consumo: (sinal?: AbortSignal) => chamar<EstadoConsumo>('/api/notificacao/demo/consumo', { sinal }),
  definirConsumo: (ativo: boolean) => chamar<EstadoConsumo>('/api/notificacao/demo/consumo', { metodo: 'PUT', corpo: { ativo } }),
  errosNaFila: (sinal?: AbortSignal) => chamar<ErroNaFila[]>('/api/notificacao/operacao/erros', { sinal }),
  reprocessar: (idEvento: string) => chamar<unknown>(`/api/notificacao/operacao/erros/${id(idEvento)}/reprocessar`, { metodo: 'POST', corpo: {} }),
  reprocessamentos: (sinal?: AbortSignal) => chamar<Reprocessamento[]>('/api/notificacao/operacao/reprocessamentos', { sinal }),
};

export type NomeServico = 'agendamento' | 'cadastro' | 'notificacao';

export const saude = (servico: NomeServico, sinal?: AbortSignal) =>
  chamar<{ status: string }>(`/api/${servico}/saude`, { sinal, prazoMs: 4000 });
