import { useCallback, useState } from 'react';
import { motivo, tipoDaFalha } from '../../api/cliente';
import { agendamento } from '../../api/servicos';
import type { Consulta } from '../../api/tipos';
import { MARGEM_CONFERENCIA_MS } from './cancelamentos';

export type NovaSituacao = 'confirmada' | 'concluida' | 'falta';

/** Ainda vai acontecer: nem cancelada, nem já encerrada (concluida/falta). */
export function consultaAtiva(c: Consulta): boolean {
  return c.status === 'agendada' || c.status === 'confirmada';
}

/**
 * Mudança de situação pedida nesta tela (US-28): mesma lógica de incerteza do cancelamento
 * (cancelamentos.ts) — sem resposta do serviço, só a próxima leitura da agenda diz se aconteceu.
 */
export type EstadoSituacao =
  | { fase: 'enviando' }
  | { fase: 'confirmado'; em: number }
  | { fase: 'recusado'; mensagem: string }
  | { fase: 'incerto'; em: number; alvo: NovaSituacao };

/** Resultado de uma falha incerta, conferido com uma leitura da agenda feita depois dela. */
export function conferirSituacao(estado: EstadoSituacao, consulta: Consulta | undefined, lidoEm: number): EstadoSituacao {
  if (estado.fase !== 'incerto' || lidoEm <= estado.em || !consulta) return estado;
  if (consulta.status === estado.alvo) return { fase: 'confirmado', em: estado.em };
  // Não necessariamente "nada mudou": outra pessoa pode ter aplicado uma situação diferente da pedida
  // enquanto a resposta estava perdida. A mensagem não afirma qual é a situação atual, só pede para conferir.
  return lidoEm - estado.em > MARGEM_CONFERENCIA_MS
    ? { fase: 'recusado', mensagem: 'A agenda não confirma essa mudança. Confira a situação atual antes de tentar de novo.' }
    : estado;
}

export function resultadoDaFalhaSituacao(erro: unknown, alvo: NovaSituacao): EstadoSituacao {
  if (tipoDaFalha(erro) === 'incerta') return { fase: 'incerto', em: Date.now(), alvo };
  return { fase: 'recusado', mensagem: `A situação não foi alterada: ${motivo(erro)}.` };
}

export function useMudancasSituacao(consultas: Consulta[] | undefined, lidoEm: number) {
  const [estados, setEstados] = useState<ReadonlyMap<string, EstadoSituacao>>(new Map());
  const definir = (id: string, e: EstadoSituacao) => setEstados((atual) => new Map(atual).set(id, e));

  const estado = useCallback((consulta: Consulta): EstadoSituacao | undefined => {
    const e = estados.get(consulta.id);
    return e && conferirSituacao(e, consultas?.find((c) => c.id === consulta.id), lidoEm);
  }, [estados, consultas, lidoEm]);

  const mudar = async (consulta: Consulta, nova: NovaSituacao, depois: () => Promise<unknown>) => {
    if (estados.get(consulta.id)?.fase === 'enviando') return;
    definir(consulta.id, { fase: 'enviando' });
    try {
      await agendamento.mudarSituacao(consulta.id, nova);
      definir(consulta.id, { fase: 'confirmado', em: Date.now() });
    } catch (erro) {
      definir(consulta.id, resultadoDaFalhaSituacao(erro, nova));
    }
    await depois();
  };

  return { estado, mudar };
}
