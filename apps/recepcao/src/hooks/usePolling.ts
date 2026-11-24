import { useCallback, useEffect, useRef, useState } from 'react';

/** Busca `carregar` agora e a cada `intervaloMs`. `recarregar` força uma busca imediata. */
export function usePolling<T>(carregar: () => Promise<T>, intervaloMs: number) {
  const [dados, setDados] = useState<T | undefined>(undefined);
  const [erro, setErro] = useState<Error | null>(null);
  const carregarRef = useRef(carregar);
  const pendente = useRef<Promise<void> | null>(null);
  const ativo = useRef(true);
  carregarRef.current = carregar;

  const recarregar = useCallback(() => {
    // Não sobrepõe pedidos: uma resposta antiga não pode desfazer o estado mais novo.
    if (pendente.current) return pendente.current;
    const pedido = (async () => {
      try {
        const resultado = await carregarRef.current();
        if (ativo.current) { setDados(resultado); setErro(null); }
      } catch (e) {
        if (ativo.current) setErro(e as Error);
      }
    })();
    pendente.current = pedido;
    void pedido.finally(() => { pendente.current = null; });
    return pedido;
  }, []);

  useEffect(() => {
    ativo.current = true;
    void recarregar();
    const timer = setInterval(recarregar, intervaloMs);
    return () => { ativo.current = false; clearInterval(timer); };
  }, [recarregar, intervaloMs]);

  return { dados, erro, recarregar };
}
