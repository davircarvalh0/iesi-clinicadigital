import type { Consulta, Lembrete, ModoEnvio, CanalEnvio, ResultadoTentativa, StatusLembrete } from '../api/tipos';

export type Tom = 'neutro' | 'info' | 'ok' | 'alerta' | 'perigo' | 'marca';

/** Nome de cada situação do lembrete, do ponto de vista de quem está na recepção. */
export const SITUACAO: Record<StatusLembrete, { nome: string; filtro: string; tom: Tom; descricao: string }> = {
  programado: { nome: 'Programado', filtro: 'Programados', tom: 'info', descricao: 'Aguarda o horário de envio.' },
  enviando: { nome: 'Enviando', filtro: 'Enviando', tom: 'info', descricao: 'O envio está em andamento.' },
  simulado: { nome: 'Envio simulado', filtro: 'Simulados', tom: 'neutro', descricao: 'Registrado só no log. Nenhuma mensagem saiu da clínica.' },
  aceito_provedor: { nome: 'Aceito pelo WhatsApp', filtro: 'Aceitos pelo WhatsApp', tom: 'ok', descricao: 'O WhatsApp aceitou a mensagem. Isso não confirma que chegou ao aparelho.' },
  falhou: { nome: 'Falhou', filtro: 'Falharam', tom: 'perigo', descricao: 'As tentativas acabaram ou a consulta já começou.' },
  bloqueado: { nome: 'Bloqueado', filtro: 'Bloqueados', tom: 'alerta', descricao: 'Não há autorização de contato neste canal.' },
  incerto: { nome: 'Sem confirmação', filtro: 'Sem confirmação', tom: 'alerta', descricao: 'O pedido pode ter chegado ao WhatsApp. A recepção decide se reenvia.' },
  cancelado: { nome: 'Cancelado', filtro: 'Cancelados', tom: 'neutro', descricao: 'A consulta foi cancelada antes do envio.' },
  enviado: { nome: 'Enviado (sem classificação)', filtro: 'Sem classificação', tom: 'neutro', descricao: 'Registro antigo, anterior à distinção entre simulado e real.' },
};

/** Ordem dos filtros: o que pede ação primeiro. */
export const ORDEM_FILTROS: StatusLembrete[] = ['incerto', 'falhou', 'bloqueado', 'programado', 'enviando', 'aceito_provedor', 'simulado', 'cancelado', 'enviado'];

/** Situações em que o canal já foi chamado ou o lembrete não muda mais sozinho. */
const ENCERRADAS: StatusLembrete[] = ['simulado', 'aceito_provedor', 'falhou', 'bloqueado', 'incerto', 'cancelado', 'enviado'];

export const RESULTADO_TENTATIVA: Record<ResultadoTentativa, { nome: string; tom: Tom }> = {
  em_andamento: { nome: 'Em andamento', tom: 'info' },
  simulado: { nome: 'Simulado', tom: 'neutro' },
  aceito_provedor: { nome: 'Aceito pelo WhatsApp', tom: 'ok' },
  falhou: { nome: 'Falhou', tom: 'perigo' },
  indeterminado: { nome: 'Sem confirmação', tom: 'alerta' },
};

export function descreverEnvio(modo: ModoEnvio | null, canal: CanalEnvio | null): string | null {
  if (!modo) return null;
  if (modo === 'simulado') return 'simulado (log)';
  return canal === 'whatsapp' ? 'real, pelo WhatsApp' : 'real';
}

/**
 * O que a Notificação ainda não refletiu da última alteração da consulta.
 * Sem pendência quando os dois serviços concordam ou quando o lembrete já não pode mudar.
 */
export type Pendencia = 'programacao' | 'remarcacao' | 'cancelamento';

export function pendenciaDe(consulta: Consulta, lembrete: Lembrete | undefined, agora = Date.now()): Pendencia | null {
  const futura = new Date(consulta.inicio).getTime() > agora;
  if (consulta.status === 'cancelada') {
    if (!lembrete) return null;
    return ENCERRADAS.includes(lembrete.status) ? null : 'cancelamento';
  }
  if (!lembrete) return futura ? 'programacao' : null;
  if (lembrete.status === 'cancelado') return futura ? 'programacao' : null;
  if (
    lembrete.status === 'programado' && lembrete.inicioConsulta &&
    new Date(lembrete.inicioConsulta).getTime() !== new Date(consulta.inicio).getTime()
  ) return 'remarcacao';
  return null;
}

export const TEXTO_PENDENCIA: Record<Pendencia, string> = {
  programacao: 'A Notificação ainda não programou o lembrete desta consulta.',
  remarcacao: 'A Notificação ainda tem o horário anterior. O lembrete será reprogramado quando a remarcação chegar.',
  cancelamento: 'A Notificação ainda não recebeu o cancelamento. O lembrete continua ativo até lá.',
};

/** Antecedência menor que 24 h só existe no modo de demonstração. */
export const antecedenciaDeDemonstracao = (minutos: number | null | undefined) => minutos != null && minutos < 1440;
