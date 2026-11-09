import { requisitar } from './http';

export interface Paciente {
  id: string;
  cpf: string;
  nome: string;
  telefone: string;
  email: string | null;
  revisao: number;
  atualizadoEm: string;
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
  atualizar: (id: string, contato: { telefone: string; email: string | null; revisao: number }) =>
    requisitar<Paciente>(`/api/cadastro/pacientes/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(contato), signal: AbortSignal.timeout(10000),
    }),
};
