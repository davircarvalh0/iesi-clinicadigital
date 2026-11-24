// Regras puras de sincronização da recepção (US-18): sem React, testadas em test/sincronizacao.test.ts.
import type { Consulta, Lembrete } from './tipos';

/** Resultado do polling de um recurso. `atualizadoEm` é o início da última busca bem-sucedida (ms). */
export interface Leitura<T> {
  dados?: T;
  erro: Error | null;
  atualizadoEm: number | null;
}

/**
 * - `carregando`: ainda sem resposta nenhuma.
 * - `atualizado`: última busca deu certo há pouco.
 * - `atrasado`: sem erro, mas a resposta está demorando (latência); os dados mostrados envelhecem.
 * - `desatualizado`: o serviço falhou depois de já ter respondido; mostra o último dado conhecido.
 * - `indisponivel`: o serviço nunca respondeu; a situação é desconhecida.
 */
export type Situacao = 'carregando' | 'atualizado' | 'atrasado' | 'desatualizado' | 'indisponivel';

export function situacaoDe(leitura: Leitura<unknown>, agora: number, limiteAtrasoMs: number): Situacao {
  if (leitura.atualizadoEm === null) return leitura.erro ? 'indisponivel' : 'carregando';
  if (leitura.erro) return 'desatualizado';
  return agora - leitura.atualizadoEm > limiteAtrasoMs ? 'atrasado' : 'atualizado';
}

/** Há dados, mas não dá para garantir que refletem o estado atual do serviço. */
export const situacaoVelha = (s: Situacao) => s === 'atrasado' || s === 'desatualizado';
/** Não há dado nenhum do serviço. */
export const situacaoDesconhecida = (s: Situacao) => s === 'carregando' || s === 'indisponivel';

/** A Notificação ainda não refletiu a última alteração que o Agendamento gravou. */
export type Pendencia = 'programacao' | 'remarcacao' | 'cancelamento';

/** Estados finais: o cancelamento da consulta não muda mais o lembrete. Os demais ainda podem ser cancelados. */
const LEMBRETE_ENCERRADO = new Set<Lembrete['status']>(['enviado', 'cancelado']);

/**
 * Compara a consulta gravada no Agendamento com o lembrete que a Notificação expõe.
 * Só é chamada com a lista de lembretes já carregada ao menos uma vez.
 */
export function pendenciaDoLembrete(consulta: Consulta, lembrete: Lembrete | undefined): Pendencia | null {
  if (consulta.status === 'cancelada') {
    return lembrete && !LEMBRETE_ENCERRADO.has(lembrete.status) ? 'cancelamento' : null;
  }
  if (!lembrete) return 'programacao';
  if (lembrete.inicioConsulta && new Date(lembrete.inicioConsulta).getTime() !== new Date(consulta.inicio).getTime()) {
    return 'remarcacao';
  }
  return null;
}

/** Estado do cancelamento pedido nesta tela, por consulta. */
export type AcaoCancelamento =
  | { fase: 'enviando' }
  /** O Agendamento confirmou. `observacao` explica confirmações indiretas. */
  | { fase: 'confirmada'; em: number; observacao?: string }
  | { fase: 'falhou'; mensagem: string }
  /** Sem resposta: pode ou não ter sido gravado. `em` é quando a falha foi percebida. */
  | { fase: 'incerta'; mensagem: string; em: number };

/** Um cancelamento confirmado pelo Agendamento vale mesmo antes de a lista recarregada chegar. */
export function aplicarAcao(consulta: Consulta, acao: AcaoCancelamento | undefined): Consulta {
  return acao?.fase === 'confirmada' && consulta.status !== 'cancelada' ? { ...consulta, status: 'cancelada' } : consulta;
}

/**
 * Resolve um cancelamento incerto com a agenda lida depois da falha. Antes disso, nada é afirmado.
 * Repetir depois de "não confirmado" é seguro: se a gravação tiver acontecido, o Agendamento responde 409.
 */
export function conferirCancelamento(acao: AcaoCancelamento, consulta: Consulta, consultasAtualizadasEm: number | null): AcaoCancelamento {
  if (acao.fase !== 'incerta' || consultasAtualizadasEm === null || consultasAtualizadasEm <= acao.em) return acao;
  if (consulta.status === 'cancelada') {
    return { fase: 'confirmada', em: consultasAtualizadasEm, observacao: 'confirmado pela agenda atualizada' };
  }
  return {
    fase: 'falhou',
    mensagem: 'Cancelamento não confirmado: a agenda atualizada ainda mostra a consulta como agendada. Você pode tentar de novo.',
  };
}
