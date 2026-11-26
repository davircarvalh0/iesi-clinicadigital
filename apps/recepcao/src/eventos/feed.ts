import type { TomSelo } from '../componentes/Selo';
import { dataHora } from '../formatacao';
import type { Atividade, EventoPublicado } from '../tipos';

export type Servico = 'agendamento' | 'notificacao';

export interface ItemFeed {
  id: string;
  servico: Servico;
  titulo: string;
  detalhe: string;
  /** Tipo do evento no barramento, quando houver. */
  tipo?: string;
  idEvento?: string;
  quando: string;
  tom: TomSelo;
}

const ATIVIDADES: Record<string, { titulo: string; tom: TomSelo }> = {
  'lembrete.programado': { titulo: 'Lembrete programado', tom: 'marca' },
  'lembrete.reprogramado': { titulo: 'Lembrete reprogramado', tom: 'marca' },
  'lembrete.expirado': { titulo: 'Lembrete descartado', tom: 'neutro' },
  'lembrete.cancelado': { titulo: 'Lembrete cancelado', tom: 'neutro' },
  'lembrete.evento_obsoleto': { titulo: 'Evento fora de ordem ignorado', tom: 'neutro' },
  'lembrete.corrida_envio': { titulo: 'Corrida com envio em andamento', tom: 'alerta' },
  'lembrete.enviado': { titulo: 'Resultado de envio sem classificação', tom: 'neutro' },
  'lembrete.simulado': { titulo: 'Envio simulado', tom: 'neutro' },
  'lembrete.aceito_provedor': { titulo: 'Aceito pelo WhatsApp', tom: 'sucesso' },
  'lembrete.falhou': { titulo: 'Lembrete falhou', tom: 'perigo' },
  'lembrete.bloqueado': { titulo: 'Lembrete bloqueado', tom: 'alerta' },
  'lembrete.liberado': { titulo: 'Lembrete liberado', tom: 'marca' },
  'autorizacao.atualizada': { titulo: 'Autorização de contato atualizada', tom: 'info' },
  'envio.nova_tentativa': { titulo: 'Erro no envio, tentando de novo', tom: 'alerta' },
  'evento.duplicado': { titulo: 'Evento duplicado ignorado', tom: 'neutro' },
  'evento.nova_tentativa': { titulo: 'Erro ao processar, nova tentativa', tom: 'alerta' },
  'evento.rejeitado': { titulo: 'Evento enviado à fila de erros', tom: 'perigo' },
  'consumo.pausado': { titulo: 'Notificação fora do ar', tom: 'perigo' },
  'consumo.retomado': { titulo: 'Notificação de volta ao ar', tom: 'sucesso' },
  'reprocessamento.solicitado': { titulo: 'Reprocessamento solicitado', tom: 'marca' },
  'reprocessamento.falhou': { titulo: 'Reprocessamento não confirmado', tom: 'perigo' },
};

/** Título e tom de uma atividade da Notificação; ações desconhecidas aparecem pelo código. */
export function rotuloAtividade(acao: string): { titulo: string; tom: TomSelo } {
  return ATIVIDADES[acao] ?? { titulo: acao, tom: 'neutro' };
}

/** Junta o que o Agendamento publicou e o que a Notificação fez numa linha do tempo única. */
export function montarFeed(eventos: EventoPublicado[], atividades: Atividade[]): ItemFeed[] {
  const doAgendamento = eventos.map<ItemFeed>((e) => ({
    id: `ag-${e.id}`,
    servico: 'agendamento',
    titulo: !e.publicadoEm ? 'Evento na outbox, aguardando' : e.duplicado ? 'Evento reenviado (mesmo id)' : 'Evento publicado',
    detalhe: `${e.pacienteNome} · consulta ${dataHora(e.inicio)}`,
    tipo: e.tipo,
    idEvento: e.idEvento,
    quando: e.publicadoEm ?? e.criadoEm,
    tom: e.duplicado ? 'alerta' : 'info',
  }));

  // A Notificação não guarda nomes nas atividades; o nome vem da agenda, que a recepção já vê.
  const nomes = new Map(eventos.map((e) => [e.idConsulta, e.pacienteNome]));
  const daNotificacao = atividades.map<ItemFeed>((a) => ({
    id: `no-${a.id}`,
    servico: 'notificacao',
    titulo: ATIVIDADES[a.acao]?.titulo ?? a.acao,
    detalhe: a.acao === 'lembrete.enviado' ? 'Registro anterior à distinção entre simulação e aceite' : a.descricao,
    idEvento: a.idEvento ?? undefined,
    quando: a.ocorridoEm,
    tom: ATIVIDADES[a.acao]?.tom ?? 'neutro',
  }));

  return [...doAgendamento, ...daNotificacao].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 40);
}

function detalheAtividade(a: Atividade, nomes: Map<string, string>): string {
  if (!a.idConsulta) return a.descricao;
  const quem = nomes.get(a.idConsulta) ?? `Consulta ${a.idConsulta.slice(0, 8)}`;
  return `${quem} · ${a.descricao}`;
}
