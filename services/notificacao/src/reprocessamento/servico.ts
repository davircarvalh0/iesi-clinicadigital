import { randomUUID } from 'node:crypto';
import { registrarAtividade } from '../atividades/registro';
import { prisma } from '../db';
import { ErroHttp } from '../http/erros';
import { listarMensagensEmErro, republicarMensagem } from './fila-erros';

const filaIndisponivel = () => new ErroHttp(503, 'Fila de erros indisponível. Tente novamente.');

/** Mensagens da fila de erros (só ids, tipo, tentativas e motivo), com o histórico de reprocessamento de cada uma. */
export async function inspecionar(limite: number) {
  const mensagens = await listarMensagensEmErro(limite).catch((erro) => {
    throw erro instanceof ErroHttp ? erro : filaIndisponivel();
  });
  const ids = mensagens.flatMap((m) => (m.idEvento ? [m.idEvento] : []));
  const [processados, historico] = await Promise.all([
    prisma.eventoProcessado.findMany({ where: { idEvento: { in: ids } }, select: { idEvento: true } }),
    prisma.reprocessamento.groupBy({ by: ['idEvento'], where: { idEvento: { in: ids } }, _count: { _all: true } }),
  ]);
  const jaProcessados = new Set(processados.map((p) => p.idEvento));
  const reprocessamentos = new Map(historico.map((h) => [h.idEvento, h._count._all]));
  return mensagens.map((m) => ({
    ...m,
    // Um evento já processado é ignorado como duplicado se for reprocessado (não cria outro lembrete).
    jaProcessado: m.idEvento ? jaProcessados.has(m.idEvento) : false,
    reprocessamentos: m.idEvento ? reprocessamentos.get(m.idEvento) ?? 0 : 0,
  }));
}

export function listarReprocessamentos(limite: number, idEvento?: string) {
  return prisma.reprocessamento.findMany({
    where: idEvento ? { idEvento } : undefined,
    orderBy: { solicitadoEm: 'desc' },
    take: limite,
  });
}

/**
 * Republica uma mensagem da fila de erros, mantendo o `id_evento`, e registra quem pediu e quando.
 * O resultado do processamento depende do consumidor: se o evento já foi processado, é ignorado como duplicado;
 * se falhar de novo, volta para a fila de erros pelo fluxo normal de tentativas.
 */
export async function reprocessar(idEvento: string, solicitante: string, idSolicitante?: string) {
  const idReprocessamento = randomUUID();
  const resultado = await republicarMensagem(idEvento, idReprocessamento, async (resumo) => {
    await prisma.reprocessamento.create({
      data: { id: idReprocessamento, idEvento, tipo: resumo.tipo, idConsulta: resumo.idConsulta, solicitante, idSolicitante },
    });
  }).catch((erro) => {
    throw erro instanceof ErroHttp ? erro : filaIndisponivel();
  });
  if (!resultado.localizada) throw new ErroHttp(404, 'Mensagem não encontrada na fila de erros');

  const { resumo, republicada } = resultado;
  const reprocessamento = await prisma.$transaction(async (tx) => {
    const atualizado = await tx.reprocessamento.update({
      where: { id: idReprocessamento },
      data: { resultado: republicada ? 'republicado' : 'falhou' },
    });
    await registrarAtividade({
      acao: republicada ? 'reprocessamento.solicitado' : 'reprocessamento.falhou',
      descricao: republicada
        ? `reprocessamento solicitado para ${resumo.tipo ?? 'mensagem'}`
        : 'republicação não confirmada; a mensagem continua na fila de erros',
      idEvento,
      idConsulta: resumo.idConsulta ?? undefined,
    }, tx);
    return atualizado;
  });
  if (!republicada) throw new ErroHttp(503, 'Republicação não confirmada. A mensagem continua na fila de erros.');
  return reprocessamento;
}
