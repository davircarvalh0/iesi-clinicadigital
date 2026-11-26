import type { TomSelo } from '../componentes/Selo';
import type { Lembrete, StatusLembrete } from '../tipos';

/** Selo de cada situação do lembrete, usado na agenda e na tela de lembretes (US-09). */
export const SELO_LEMBRETE: Record<StatusLembrete, { tom: TomSelo; texto: string }> = {
  programado: { tom: 'marca', texto: 'Lembrete programado' },
  enviando: { tom: 'alerta', texto: 'Envio em andamento' },
  enviado: { tom: 'neutro', texto: 'Resultado de envio sem classificação' },
  simulado: { tom: 'neutro', texto: 'Envio simulado' },
  aceito_provedor: { tom: 'sucesso', texto: 'Aceito pelo WhatsApp' },
  falhou: { tom: 'perigo', texto: 'Lembrete falhou' },
  cancelado: { tom: 'neutro', texto: 'Lembrete cancelado' },
  bloqueado: { tom: 'alerta', texto: 'Lembrete bloqueado' },
};

/** Nome curto da situação, para os filtros. */
export const NOME_SITUACAO: Record<StatusLembrete, string> = {
  programado: 'Programados',
  enviando: 'Em envio',
  enviado: 'Sem classificação',
  simulado: 'Simulados',
  aceito_provedor: 'Aceitos pelo WhatsApp',
  falhou: 'Falharam',
  cancelado: 'Cancelados',
  bloqueado: 'Bloqueados',
};

/** Ordem dos filtros: o que pede atenção primeiro. */
export const ORDEM_SITUACOES: StatusLembrete[] = [
  'falhou', 'bloqueado', 'programado', 'enviando', 'aceito_provedor', 'simulado', 'enviado', 'cancelado',
];

/** Modo de envio explícito (US-12): nunca apresenta simulação como envio real. */
export function descreverModo(l: Pick<Lembrete, 'modoEnvio' | 'canalEnvio'>): string {
  if (l.modoEnvio === 'real') return 'Real · WhatsApp';
  if (l.modoEnvio === 'simulado') return 'Simulado · log';
  return 'Ainda sem envio';
}
