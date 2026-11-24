import { classificarFalha, descreverFalha, ErroApi } from '../api/http';
import type { AcaoCancelamento } from '../sincronizacao';

/**
 * Pede o cancelamento e traduz o resultado para a tela. Nunca rejeita: toda falha vira um estado visível.
 * Só há "confirmada" quando o Agendamento respondeu que a consulta está cancelada.
 */
export async function cancelarConsulta(
  cancelar: (id: string) => Promise<unknown>,
  id: string,
  agora: () => number = Date.now,
): Promise<AcaoCancelamento> {
  try {
    await cancelar(id);
    return { fase: 'confirmada', em: agora() };
  } catch (e) {
    // O Agendamento só responde 409 ao cancelamento quando a consulta já está cancelada.
    if (e instanceof ErroApi && e.status === 409) {
      return { fase: 'confirmada', em: agora(), observacao: 'a consulta já estava cancelada' };
    }
    const mensagem = descreverFalha(e, 'o cancelamento');
    return classificarFalha(e) === 'incerta' ? { fase: 'incerta', mensagem, em: agora() } : { fase: 'falhou', mensagem };
  }
}
