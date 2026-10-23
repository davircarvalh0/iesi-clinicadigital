import type { Atividade, EstadoConsumo, Lembrete } from '../tipos';
import { requisitar } from './http';

const BASE = '/api/notificacao';

export const notificacaoApi = {
  listar: (idConsulta?: string) =>
    requisitar<Lembrete[]>(
      idConsulta ? `${BASE}/lembretes?consulta=${encodeURIComponent(idConsulta)}` : `${BASE}/lembretes`,
    ),
  listarAtividades: () => requisitar<Atividade[]>(`${BASE}/atividades?limite=30`),
  estadoConsumo: () => requisitar<EstadoConsumo>(`${BASE}/demo/consumo`),
  definirConsumo: (ativo: boolean) =>
    requisitar<EstadoConsumo>(`${BASE}/demo/consumo`, { method: 'PUT', body: JSON.stringify({ ativo }) }),
};
