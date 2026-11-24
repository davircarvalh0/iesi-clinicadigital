import type { Atividade, EstadoConsumo, Lembrete } from '../tipos';
import { requisitar } from './http';

const BASE = '/api/notificacao';

export const notificacaoApi = {
  listar: (idConsulta?: string) =>
    requisitar<Lembrete[]>(
      idConsulta ? `${BASE}/lembretes?consulta=${encodeURIComponent(idConsulta)}` : `${BASE}/lembretes`,
    ),
  /** Cópia da autorização que a Notificação usa no envio (US-14). */
  copiaAutorizacoes: (idPaciente: string, signal?: AbortSignal) =>
    requisitar<{ autorizacoes: { canal: string; situacao: string; versao: number }[] }>(
      `${BASE}/autorizacoes/${encodeURIComponent(idPaciente)}`,
      { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) },
    ),
  listarAtividades: () => requisitar<Atividade[]>(`${BASE}/atividades?limite=30`),
  estadoConsumo: () => requisitar<EstadoConsumo>(`${BASE}/demo/consumo`),
  definirConsumo: (ativo: boolean) =>
    requisitar<EstadoConsumo>(`${BASE}/demo/consumo`, { method: 'PUT', body: JSON.stringify({ ativo }) }),
};
