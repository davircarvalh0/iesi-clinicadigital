import type { Atividade, EventoPublicado } from '../api/tipos';
import { dataHora } from './datas';
import type { Tom } from './lembretes';

/** Linha do painel "Integração ao vivo": um evento publicado pelo Agendamento ou uma ação da Notificação. */
export interface Ocorrencia {
  chave: string;
  origem: 'Agendamento' | 'Notificação';
  titulo: string;
  detalhe: string;
  tipo: string | null;
  idEvento: string | null;
  em: string;
  tom: Tom;
}

const EVENTO: Record<string, string> = {
  'consulta.agendada': 'Consulta agendada publicada',
  'consulta.reagendada': 'Remarcação publicada',
  'consulta.cancelada': 'Cancelamento publicado',
};

const ATIVIDADE: Record<string, { titulo: string; tom: Tom }> = {
  'lembrete.programado': { titulo: 'Lembrete programado', tom: 'ok' },
  'lembrete.reprogramado': { titulo: 'Lembrete reprogramado', tom: 'ok' },
  'lembrete.cancelado': { titulo: 'Lembrete cancelado', tom: 'neutro' },
  'lembrete.evento_obsoleto': { titulo: 'Evento atrasado ignorado', tom: 'neutro' },
  'lembrete.corrida_envio': { titulo: 'Alteração durante o envio', tom: 'alerta' },
  'lembrete.expirado': { titulo: 'Lembrete fora do prazo', tom: 'alerta' },
  'lembrete.simulado': { titulo: 'Envio simulado', tom: 'neutro' },
  'lembrete.aceito_provedor': { titulo: 'Aceito pelo WhatsApp', tom: 'ok' },
  'lembrete.falhou': { titulo: 'Envio falhou', tom: 'perigo' },
  'lembrete.bloqueado': { titulo: 'Envio bloqueado', tom: 'alerta' },
  'lembrete.liberado': { titulo: 'Envio liberado', tom: 'ok' },
  'lembrete.incerto': { titulo: 'Envio sem confirmação', tom: 'alerta' },
  'lembrete.reenvio_solicitado': { titulo: 'Reenvio solicitado', tom: 'info' },
  'lembrete.mantido_sem_reenvio': { titulo: 'Mantido sem reenvio', tom: 'neutro' },
  'envio.retomado': { titulo: 'Envio retomado', tom: 'info' },
  'envio.nova_tentativa': { titulo: 'Nova tentativa de envio', tom: 'alerta' },
  'autorizacao.atualizada': { titulo: 'Autorização de contato atualizada', tom: 'info' },
  'evento.duplicado': { titulo: 'Evento duplicado ignorado', tom: 'marca' },
  'evento.nova_tentativa': { titulo: 'Evento em nova tentativa', tom: 'alerta' },
  'evento.rejeitado': { titulo: 'Evento recusado', tom: 'perigo' },
  'consumo.pausado': { titulo: 'Notificação fora do ar', tom: 'perigo' },
  'consumo.retomado': { titulo: 'Notificação de volta', tom: 'ok' },
  'reprocessamento.solicitado': { titulo: 'Reprocessamento solicitado', tom: 'info' },
  'reprocessamento.falhou': { titulo: 'Reprocessamento falhou', tom: 'perigo' },
};

export function juntarOcorrencias(eventos: EventoPublicado[], atividades: Atividade[], limite = 50): Ocorrencia[] {
  const doAgendamento: Ocorrencia[] = eventos.map((e) => ({
    chave: `e-${e.id}`,
    origem: 'Agendamento',
    titulo: e.duplicado ? 'Evento reenviado (duplicado)' : EVENTO[e.tipo] ?? 'Evento publicado',
    detalhe: `${e.pacienteNome} · consulta ${dataHora(e.inicio)}${e.publicadoEm ? '' : ' · aguardando o broker'}`,
    tipo: e.tipo,
    idEvento: e.idEvento,
    em: e.publicadoEm ?? e.criadoEm,
    tom: e.publicadoEm ? 'info' : 'alerta',
  }));
  const daNotificacao: Ocorrencia[] = atividades.map((a) => ({
    chave: `a-${a.id}`,
    origem: 'Notificação',
    titulo: ATIVIDADE[a.acao]?.titulo ?? a.acao,
    detalhe: a.descricao,
    tipo: null,
    idEvento: a.idEvento,
    em: a.ocorridoEm,
    tom: ATIVIDADE[a.acao]?.tom ?? 'neutro',
  }));
  return [...doAgendamento, ...daNotificacao]
    .sort((a, b) => new Date(b.em).getTime() - new Date(a.em).getTime())
    .slice(0, limite);
}

export const nomeAtividade = (acao: string) => ATIVIDADE[acao]?.titulo ?? acao;
