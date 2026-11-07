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

export interface PaginaPacientes {
  pacientes: Paciente[];
  total: number;
  totalFiltrado: number;
  pagina: number;
  tamanhoPagina: number;
}

export const cadastroApi = {
  listar: (busca = '', pagina = 1, signal?: AbortSignal, tamanhoPagina = 20) =>
    requisitar<PaginaPacientes>(`/api/cadastro/pacientes?${new URLSearchParams({ busca, pagina: String(pagina), tamanhoPagina: String(tamanhoPagina) })}`, { signal }),
  resumo: () => cadastroApi.listar('', 1, undefined, 1),
  atualizar: (id: string, contato: { telefone: string; email: string | null; revisao: number }) =>
    requisitar<Paciente>(`/api/cadastro/pacientes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(contato) }),
};
