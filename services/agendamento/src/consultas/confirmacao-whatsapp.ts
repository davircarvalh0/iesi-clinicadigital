import type { ConsultaConfirmada } from '@clinica/eventos';
import { prisma } from '../db';
import { ErroHttp } from '../http/erros';
import { aplicarSituacao } from './servico';

/**
 * US-30: aplica a confirmação recebida pelo WhatsApp (evento da Notificação). Idempotente pelo id_evento.
 * Consulta cancelada, encerrada ou que já começou na hora da resposta não muda: o evento é aceito e ignorado.
 */
export async function aplicarConfirmacaoWhatsapp(evento: ConsultaConfirmada): Promise<'confirmada' | 'ignorada' | 'duplicada'> {
  return prisma.$transaction(async (tx) => {
    const registro = await tx.eventoProcessado.createMany({ data: { idEvento: evento.id_evento }, skipDuplicates: true });
    if (!registro.count) return 'duplicada';
    try {
      await aplicarSituacao(tx, evento.payload.id_consulta, 'confirmada', 'whatsapp', new Date(evento.payload.confirmada_em), evento.payload.sequencia);
      return 'confirmada';
    } catch (erro) {
      // A regra recusou antes de qualquer escrita; a transação segue só com o registro do evento.
      if (erro instanceof ErroHttp) { console.warn(`[agendamento] confirmação pelo WhatsApp ignorada: ${erro.message}`); return 'ignorada'; }
      throw erro;
    }
  });
}
