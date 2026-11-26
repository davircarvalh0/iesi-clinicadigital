import type { Atividade, ConfiguracaoEnvio, EstadoConsumo, Lembrete, PaginaLembretes, TrilhaLembrete } from '../tipos';
import { requisitar } from './http';

const BASE = '/api/notificacao';

export const notificacaoApi = {
  listar: (idConsulta?: string) =>
    requisitar<Lembrete[]>(
      idConsulta ? `${BASE}/lembretes?consulta=${encodeURIComponent(idConsulta)}` : `${BASE}/lembretes`,
    ),
  /** Listagem dedicada de lembretes (US-09); `consulta` vem de consultaDoFiltro. */
  painel: (consulta: string, signal?: AbortSignal) =>
    requisitar<PaginaLembretes>(
      `${BASE}/lembretes/painel?${consulta}`,
      signal ? { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) } : {},
    ),
  /** Trilha de um lembrete: atividades e tentativas de envio (US-13). */
  trilha: (idConsulta: string, signal?: AbortSignal) =>
    requisitar<TrilhaLembrete>(
      `${BASE}/lembretes/${encodeURIComponent(idConsulta)}/trilha`,
      signal ? { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) } : {},
    ),
  /** Decisão sobre um envio sem confirmação (US-15). */
  resolverIncerto: (idConsulta: string, acao: 'reenviar' | 'manter_sem_reenvio') =>
    requisitar<{ lembrete: { status: string } }>(
      `${BASE}/lembretes/${encodeURIComponent(idConsulta)}/resolucao`,
      { method: 'POST', body: JSON.stringify({ acao }) },
    ),
  /** Modo de envio explícito (US-15). */
  configuracaoEnvio: () => requisitar<ConfiguracaoEnvio>(`${BASE}/envio/configuracao`),
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
