import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { frescorDe, type Frescor } from '../dominio/frescor';

/** Relógio da tela: re-renderiza a cada `intervaloMs` para os textos "há X s" e o frescor. */
export function useAgora(intervaloMs = 1000): number {
  const [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(timer);
  }, [intervaloMs]);
  return agora;
}

interface OpcoesLeitura {
  /** Intervalo de atualização automática. */
  intervaloMs: number;
  /** Sem resposta boa há mais que isso, o dado é tratado como atrasado (padrão: 4 ciclos). */
  limiteMs?: number;
  ativo?: boolean;
}

/**
 * Leitura periódica de um serviço com o frescor do resultado.
 * O último dado bom continua na tela quando o serviço falha, mas marcado como desatualizado.
 */
export function useLeitura<T>(chave: QueryKey, buscar: (sinal: AbortSignal) => Promise<T>, { intervaloMs, limiteMs, ativo = true }: OpcoesLeitura) {
  const consulta = useQuery({
    queryKey: chave,
    queryFn: ({ signal }) => buscar(signal),
    refetchInterval: intervaloMs,
    refetchIntervalInBackground: false,
    enabled: ativo,
    retry: false,
  });
  const agora = useAgora();
  const frescor: Frescor = frescorDe(
    { temDados: consulta.data !== undefined, temErro: consulta.isError, atualizadoEm: consulta.dataUpdatedAt },
    agora,
    limiteMs ?? intervaloMs * 4,
  );
  return { ...consulta, frescor, atualizadoEm: consulta.dataUpdatedAt || null };
}
