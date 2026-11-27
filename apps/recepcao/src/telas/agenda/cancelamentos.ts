import { useCallback, useState } from 'react';
import { motivo, statusDe, tipoDaFalha } from '../../api/cliente';
import { agendamento } from '../../api/servicos';
import type { Consulta } from '../../api/tipos';

/**
 * Cancelamento pedido nesta tela (US-18):
 * - confirmado: o Agendamento respondeu que cancelou (ou que já estava cancelada);
 * - recusado: respondeu que não cancelou;
 * - incerto: não respondeu. Só a próxima leitura da agenda diz se aconteceu.
 */
export type EstadoCancelamento =
  | { fase: 'enviando' }
  | { fase: 'confirmado'; em: number; observacao?: string }
  | { fase: 'recusado'; mensagem: string }
  | { fase: 'incerto'; em: number };

export const MARGEM_CONFERENCIA_MS = 5000;

/** Resultado de uma falha incerta, conferido com uma leitura da agenda feita depois dela. */
export function conferir(estado: EstadoCancelamento, consulta: Consulta | undefined, lidoEm: number): EstadoCancelamento {
  if (estado.fase !== 'incerto' || lidoEm <= estado.em || !consulta) return estado;
  if (consulta.status === 'cancelada') {
    return { fase: 'confirmado', em: estado.em, observacao: 'conferido na agenda depois da falha de comunicação' };
  }
  // Margem para um pedido que ainda estivesse a caminho do serviço quando o prazo acabou.
  return lidoEm - estado.em > MARGEM_CONFERENCIA_MS
    ? { fase: 'recusado', mensagem: 'A agenda continua mostrando a consulta como agendada: o cancelamento não aconteceu. Você pode tentar de novo.' }
    : estado;
}

export function resultadoDaFalha(erro: unknown): EstadoCancelamento {
  if (statusDe(erro) === 409) return { fase: 'confirmado', em: Date.now(), observacao: 'a consulta já estava cancelada' };
  if (tipoDaFalha(erro) === 'incerta') return { fase: 'incerto', em: Date.now() };
  return { fase: 'recusado', mensagem: `O cancelamento não foi feito: ${motivo(erro)}.` };
}

export function useCancelamentos(consultas: Consulta[] | undefined, lidoEm: number) {
  const [estados, setEstados] = useState<ReadonlyMap<string, EstadoCancelamento>>(new Map());
  const definir = (id: string, e: EstadoCancelamento) => setEstados((atual) => new Map(atual).set(id, e));

  const estado = useCallback((consulta: Consulta): EstadoCancelamento | undefined => {
    const e = estados.get(consulta.id);
    return e && conferir(e, consultas?.find((c) => c.id === consulta.id), lidoEm);
  }, [estados, consultas, lidoEm]);

  const cancelar = async (consulta: Consulta, depois: () => Promise<unknown>) => {
    if (estados.get(consulta.id)?.fase === 'enviando') return;
    definir(consulta.id, { fase: 'enviando' });
    try {
      await agendamento.cancelar(consulta.id);
      definir(consulta.id, { fase: 'confirmado', em: Date.now() });
    } catch (erro) {
      definir(consulta.id, resultadoDaFalha(erro));
    }
    await depois();
  };

  return { estado, cancelar };
}
