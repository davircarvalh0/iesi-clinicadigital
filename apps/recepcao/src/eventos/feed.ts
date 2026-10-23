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
  'lembrete.cancelado': { titulo: 'Lembrete cancelado', tom: 'neutro' },
  'lembrete.enviado': { titulo: 'Lembrete enviado', tom: 'sucesso' },
  'lembrete.falhou': { titulo: 'Lembrete falhou', tom: 'perigo' },
  'envio.nova_tentativa': { titulo: 'Erro no envio, tentando de novo', tom: 'alerta' },
  'evento.duplicado': { titulo: 'Evento duplicado ignorado', tom: 'neutro' },
  'evento.nova_tentativa': { titulo: 'Erro ao processar, nova tentativa', tom: 'alerta' },
  'evento.rejeitado': { titulo: 'Evento enviado à fila de erros', tom: 'perigo' },
  'consumo.pausado': { titulo: 'Notificação fora do ar', tom: 'perigo' },
  'consumo.retomado': { titulo: 'Notificação de volta ao ar', tom: 'sucesso' },
};

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

  const daNotificacao = atividades.map<ItemFeed>((a) => ({
    id: `no-${a.id}`,
    servico: 'notificacao',
    titulo: ATIVIDADES[a.acao]?.titulo ?? a.acao,
    detalhe: a.descricao,
    idEvento: a.idEvento ?? undefined,
    quando: a.ocorridoEm,
    tom: ATIVIDADES[a.acao]?.tom ?? 'neutro',
  }));

  return [...doAgendamento, ...daNotificacao].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 40);
}
