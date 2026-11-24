import type { Consulta, EventoPublicado, NovaConsulta } from '../tipos';
import { requisitar } from './http';

const BASE = '/api/agendamento';

export const agendamentoApi = {
  listar: () => requisitar<Consulta[]>(`${BASE}/consultas`),
  agendar: (dados: NovaConsulta) =>
    requisitar<Consulta>(`${BASE}/consultas`, { method: 'POST', body: JSON.stringify(dados) }),
  remarcar: (id: string, inicio: string) =>
    requisitar<Consulta>(`${BASE}/consultas/${id}`, { method: 'PATCH', body: JSON.stringify({ inicio }) }),
  cancelar: (id: string) => requisitar<Consulta>(`${BASE}/consultas/${id}`, { method: 'DELETE' }),

  listarEventos: () => requisitar<EventoPublicado[]>(`${BASE}/eventos?limite=30`),
  reenviarUltimoEvento: () => requisitar<unknown>(`${BASE}/demo/reenviar-ultimo-evento`, { method: 'POST' }),
};
