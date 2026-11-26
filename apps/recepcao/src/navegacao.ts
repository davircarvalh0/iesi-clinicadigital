export type Tela = 'agenda' | 'pacientes' | 'lembretes';

export const TITULO_TELA: Record<Tela, string> = { agenda: 'Agenda', pacientes: 'Pacientes', lembretes: 'Lembretes' };

/** Tela a partir do hash da URL; qualquer outro valor abre a agenda. */
export function telaDoHash(hash: string): Tela {
  if (hash === '#pacientes') return 'pacientes';
  if (hash === '#lembretes') return 'lembretes';
  return 'agenda';
}
