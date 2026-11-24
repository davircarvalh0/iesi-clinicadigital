import { useEffect, useMemo, useRef, useState } from 'react';
import type { Leitura } from '../sincronizacao';
import { criarFilaRecarga } from './filaRecarga';

export interface RecursoPolling<T> extends Leitura<T> {
  /** Busca agora, mesmo com outra busca em curso (que pode ser anterior a uma gravação). */
  recarregar: () => Promise<void>;
}

/**
 * Busca `carregar` agora e a cada `intervaloMs`. Em caso de erro, mantém os últimos dados com
 * `atualizadoEm` (início da última busca bem-sucedida), para a tela mostrar que estão desatualizados.
 */
export function usePolling<T>(carregar: () => Promise<T>, intervaloMs: number): RecursoPolling<T> {
  const [leitura, setLeitura] = useState<Leitura<T>>({ erro: null, atualizadoEm: null });
  const carregarRef = useRef(carregar);
  const ativo = useRef(true);
  carregarRef.current = carregar;

  const fila = useMemo(() => criarFilaRecarga(async () => {
    // O início da busca é o limite seguro: o dado reflete o servidor em algum ponto depois dele.
    const inicio = Date.now();
    try {
      const dados = await carregarRef.current();
      if (ativo.current) setLeitura({ dados, erro: null, atualizadoEm: inicio });
    } catch (e) {
      if (ativo.current) setLeitura((atual) => ({ ...atual, erro: e instanceof Error ? e : new Error(String(e)) }));
    }
  }), []);

  useEffect(() => {
    ativo.current = true;
    void fila.periodica();
    const timer = setInterval(() => void fila.periodica(), intervaloMs);
    return () => { ativo.current = false; clearInterval(timer); };
  }, [fila, intervaloMs]);

  return { ...leitura, recarregar: fila.forcada };
}
