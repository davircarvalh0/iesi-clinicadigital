import { useCallback, useEffect, useRef, useState } from 'react';

/** Busca `carregar` agora e a cada `intervaloMs`. `recarregar` força uma busca imediata. */
export function usePolling<T>(carregar: () => Promise<T>, intervaloMs: number) {
  const [dados, setDados] = useState<T | undefined>(undefined);
  const [erro, setErro] = useState<Error | null>(null);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  const recarregar = useCallback(async () => {
    try {
      setDados(await carregarRef.current());
      setErro(null);
    } catch (e) {
      setErro(e as Error);
    }
  }, []);

  useEffect(() => {
    void recarregar();
    const timer = setInterval(recarregar, intervaloMs);
    return () => clearInterval(timer);
  }, [recarregar, intervaloMs]);

  return { dados, erro, recarregar };
}
