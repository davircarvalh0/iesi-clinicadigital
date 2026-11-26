import { requisitar } from './http';

export interface Paciente {
  id: string;
  cpf: string;
  nome: string;
  telefone: string;
  email: string | null;
  revisao: number;
}

export type CanalContato = 'whatsapp' | 'sms' | 'email';
export type OrigemAutorizacao = 'presencial' | 'telefone' | 'formulario';

/** Situação atual de um canal no Cadastro. `sem_registro` não é autorização. */
export interface Autorizacao {
  canal: CanalContato;
  situacao: 'autorizado' | 'revogado' | 'sem_registro';
  origem: OrigemAutorizacao | null;
  registradoEm: string | null;
  versao: number;
}

export interface PacienteDetalhe extends Paciente {
  nascimento: string | null;
  convenio: string | null;
  canalPreferido: CanalContato | null;
  autorizacoes: Autorizacao[];
}

export type PacienteAgendamento = Pick<Paciente, 'id' | 'cpf' | 'nome' | 'telefone'>;

export interface PaginaPacientes {
  pacientes: Paciente[];
  total: number;
  totalFiltrado: number;
  pagina: number;
  tamanhoPagina: number;
}

export const cadastroApi = {
  historicoAutorizacoes: (id: string, signal?: AbortSignal) =>
    requisitar<{ historico: Autorizacao[] }>(`/api/cadastro/pacientes/${encodeURIComponent(id)}/autorizacoes`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : undefined }),
  buscarPorCpf: (cpf: string, signal: AbortSignal) =>
    requisitar<{ paciente: PacienteAgendamento | null }>('/api/cadastro/pacientes/busca-cpf', {
      method: 'POST', body: JSON.stringify({ cpf }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    }),
  listar: (busca = '', pagina = 1, signal?: AbortSignal, tamanhoPagina = 20) =>
    requisitar<PaginaPacientes>(`/api/cadastro/pacientes?${new URLSearchParams({ busca, pagina: String(pagina), tamanhoPagina: String(tamanhoPagina) })}`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    }),
  resumo: () => cadastroApi.listar('', 1, undefined, 1),
  detalhar: (id: string, signal: AbortSignal) =>
    requisitar<PacienteDetalhe>(`/api/cadastro/pacientes/${encodeURIComponent(id)}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    }),
  atualizar: (id: string, contato: Pick<PacienteDetalhe, 'telefone' | 'email' | 'nascimento' | 'convenio' | 'canalPreferido' | 'revisao'>) =>
    requisitar<PacienteDetalhe>(`/api/cadastro/pacientes/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(contato), signal: AbortSignal.timeout(10000),
    }),
  registrarAutorizacao: (id: string, dados: { canal: CanalContato; situacao: 'autorizado' | 'revogado'; origem: OrigemAutorizacao }) =>
    requisitar<{ registro: Autorizacao; autorizacoes: Autorizacao[] }>(`/api/cadastro/pacientes/${encodeURIComponent(id)}/autorizacoes`, {
      method: 'POST', body: JSON.stringify(dados), signal: AbortSignal.timeout(10000),
    }),
};
