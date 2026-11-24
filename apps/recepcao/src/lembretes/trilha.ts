// Regras puras da trilha de um lembrete (US-13), testadas em test/lembretes.test.tsx.
import type { TomSelo } from '../componentes/Selo';
import { rotuloAtividade } from '../eventos/feed';
import type { ResultadoTentativa, TrilhaLembrete } from '../tipos';

export interface EntradaTrilha {
  id: string;
  em: string;
  tipo: 'atividade' | 'tentativa' | 'resolucao';
  titulo: string;
  detalhe: string;
  tom: TomSelo;
}

const RESULTADO: Record<ResultadoTentativa, { texto: string; tom: TomSelo }> = {
  em_andamento: { texto: 'sem desfecho registrado', tom: 'alerta' },
  simulado: { texto: 'simulado em log', tom: 'neutro' },
  aceito_provedor: { texto: 'aceito pelo WhatsApp', tom: 'sucesso' },
  falhou: { texto: 'falhou', tom: 'perigo' },
  indeterminado: { texto: 'sem confirmação do provedor', tom: 'alerta' },
};

const duracao = (inicio: string, fim: string | null) => {
  if (!fim) return null;
  const ms = Math.max(0, Date.parse(fim) - Date.parse(inicio));
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
};

/**
 * Junta atividades e tentativas numa linha do tempo, da mais antiga para a mais recente.
 * Uma tentativa sem conclusão aparece como "sem desfecho registrado", nunca como sucesso ou falha.
 */
export function linhaDoTempo(trilha: TrilhaLembrete): EntradaTrilha[] {
  const atividades = trilha.atividades.map<EntradaTrilha>((a) => {
    const { titulo, tom } = rotuloAtividade(a.acao);
    return { id: `a-${a.id}`, em: a.ocorridoEm, tipo: 'atividade', titulo, detalhe: a.descricao, tom };
  });
  const tentativas = trilha.tentativas.map<EntradaTrilha>((t) => {
    const { texto, tom } = RESULTADO[t.resultado];
    const partes = [
      t.modo === 'real' ? 'Real · WhatsApp' : 'Simulado · log',
      duracao(t.iniciadaEm, t.concluidaEm),
      t.motivo,
      t.idExterno && `identificador ${t.idExterno}`,
    ].filter(Boolean);
    return { id: `t-${t.id}`, em: t.iniciadaEm, tipo: 'tentativa', titulo: `Tentativa ${t.numero}: ${texto}`, detalhe: partes.join(' · '), tom };
  });
  // US-15: decisões da recepção sobre envios incertos.
  const resolucoes = (trilha.resolucoes ?? []).map<EntradaTrilha>((r) => ({
    id: `r-${r.id}`, em: r.registradaEm, tipo: 'resolucao', tom: 'info',
    titulo: r.acao === 'reenviar' ? 'Decisão: reenviar' : 'Decisão: manter sem reenvio',
    detalhe: `Registrada por ${r.solicitante}`,
  }));
  return [...atividades, ...tentativas, ...resolucoes].sort((x, y) => Date.parse(x.em) - Date.parse(y.em) || x.id.localeCompare(y.id));
}
