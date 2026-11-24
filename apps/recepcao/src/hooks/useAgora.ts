import { useEffect, useState } from 'react';

/** Hora atual, atualizada a cada `intervaloMs` (para tempos relativos como "há 5 s"). */
export function useAgora(intervaloMs = 1000): number {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(timer);
  }, [intervaloMs]);
  return agora;
}
