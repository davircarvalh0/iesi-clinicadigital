import type { Perfil } from '../api/tipos';

/** Perfis que usam as telas da recepção. */
export const RECEPCAO: Perfil[] = ['recepcionista', 'administrador'];

/** Primeira tela de cada perfil. */
export const inicioDoPerfil = (perfil: Perfil) => (perfil === 'profissional' ? '/minha-agenda' : '/agenda');
