/**
 * Coordena as buscas de um recurso consultado por polling.
 *
 * - Nunca há duas buscas em paralelo: uma resposta antiga não desfaz o estado mais novo.
 * - `periodica` pula o ciclo se já houver busca em curso.
 * - `forcada` (depois de uma gravação) não reaproveita a busca em curso, que pode ter saído antes da
 *   gravação: agenda uma nova logo em seguida. Pedidos repetidos enquanto isso viram uma só busca.
 */
export function criarFilaRecarga(buscar: () => Promise<void>) {
  let emCurso: Promise<void> | null = null;
  let seguinte: Promise<void> | null = null;

  const iniciar = (): Promise<void> => {
    const busca = buscar().finally(() => {
      if (emCurso === busca) emCurso = null;
    });
    emCurso = busca;
    return busca;
  };

  return {
    periodica(): Promise<void> {
      return emCurso ?? iniciar();
    },
    forcada(): Promise<void> {
      if (!emCurso) return iniciar();
      const proxima = () => {
        seguinte = null;
        return iniciar();
      };
      seguinte ??= emCurso.then(proxima, proxima);
      return seguinte;
    },
  };
}
