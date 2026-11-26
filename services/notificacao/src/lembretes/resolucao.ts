// US-15: decisão humana sobre um envio incerto. A recepção confere no WhatsApp (ou com o paciente)
// e escolhe reenviar ou manter sem reenvio. Quem decidiu e quando ficam registrados.
import { z } from 'zod';
import { registrarAtividade } from '../atividades/registro';
import { prisma } from '../db';
import { ErroHttp } from '../http/erros';

export const esquemaResolucao = z.object({
  acao: z.enum(['reenviar', 'manter_sem_reenvio'], 'Ação inválida. Use reenviar ou manter_sem_reenvio.'),
  solicitante: z.string('Informe quem está decidindo.').trim()
    .min(2, 'Informe quem está decidindo (2 a 80 caracteres).').max(80, 'Informe quem está decidindo (2 a 80 caracteres).'),
}).strict();

export async function resolverEnvioIncerto(idConsulta: string, entrada: unknown, agora = new Date(), idSolicitante?: string) {
  const { acao, solicitante } = esquemaResolucao.parse(entrada);
  return prisma.$transaction(async (tx) => {
    const lembrete = await tx.lembrete.findUnique({ where: { idConsulta } });
    if (!lembrete) throw new ErroHttp(404, 'Nenhum lembrete registrado para esta consulta.');
    if (lembrete.status !== 'incerto') {
      throw new ErroHttp(409, `Só um envio sem confirmação pode ser resolvido. Situação atual: ${lembrete.status}.`);
    }
    if (lembrete.incertoResolvidoEm) throw new ErroHttp(409, 'Este envio incerto já foi mantido sem reenvio.');
    if (acao === 'reenviar' && lembrete.inicioConsulta <= agora) {
      throw new ErroHttp(409, 'A consulta já começou: não há lembrete a reenviar.');
    }

    // Condicionado à leitura: duas decisões simultâneas não passam juntas.
    const { count } = await tx.lembrete.updateMany({
      where: { id: lembrete.id, status: 'incerto', incertoResolvidoEm: null, atualizadoEm: lembrete.atualizadoEm },
      data: acao === 'reenviar'
        // Volta à fila na mesma programação; a autorização é conferida de novo antes do envio.
        ? { status: 'programado', motivoFalha: `Reenvio solicitado por ${solicitante} após envio sem confirmação` }
        : { incertoResolvidoEm: agora, motivoFalha: `${lembrete.motivoFalha ?? 'Envio sem confirmação'}. Mantido sem reenvio por ${solicitante}` },
    });
    if (!count) throw new ErroHttp(409, 'O lembrete mudou enquanto a decisão era registrada. Atualize e tente de novo.');

    const resolucao = await tx.resolucaoEnvio.create({
      data: { idLembrete: lembrete.id, idConsulta, acao, solicitante, registradaEm: agora, idSolicitante },
    });
    await registrarAtividade({
      acao: acao === 'reenviar' ? 'lembrete.reenvio_solicitado' : 'lembrete.mantido_sem_reenvio',
      descricao: acao === 'reenviar'
        ? 'Reenvio solicitado pela recepção após envio sem confirmação'
        : 'Envio sem confirmação mantido sem reenvio pela recepção',
      idConsulta,
      idEvento: lembrete.idEventoConsulta ?? undefined,
    }, tx);
    return { resolucao, lembrete: await tx.lembrete.findUniqueOrThrow({ where: { id: lembrete.id }, select: { status: true, motivoFalha: true, incertoResolvidoEm: true } }) };
  });
}
