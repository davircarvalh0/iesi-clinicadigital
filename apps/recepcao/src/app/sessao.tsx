import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { configurarSessao } from '../api/cliente';
import { acesso } from '../api/servicos';
import type { Usuario } from '../api/tipos';

interface Sessao {
  usuario: Usuario | null;
  /** Motivo do último encerramento automático, mostrado na tela de entrada. */
  aviso: string | null;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: (aviso?: string) => void;
}

const Contexto = createContext<Sessao | null>(null);
const CHAVE = 'clinica.sessao';

/** O token expira em 30 min; o prazo vem dentro dele (parte antes do ponto, em base64url). */
function expiraEm(token: string): number {
  try {
    const dados = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof dados.exp === 'number' ? dados.exp : 0;
  } catch {
    return 0;
  }
}

function sessaoGuardada(): { usuario: Usuario; token: string } | null {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null');
    if (salvo?.token && salvo?.usuario && expiraEm(salvo.token) > Date.now()) return salvo;
  } catch { /* armazenamento indisponível: começa sem sessão */ }
  return null;
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const cliente = useQueryClient();
  const [estado, setEstado] = useState(() => {
    const salvo = sessaoGuardada();
    configurarSessao(salvo?.token ?? null);
    return { usuario: salvo?.usuario ?? null, token: salvo?.token ?? null, aviso: null as string | null };
  });

  const sair = useCallback((aviso?: string) => {
    // Encerra a sessão no Cadastro antes de descartar o token local (senão a chamada não leva
    // o Authorization). Melhor esforço: sem rede ou com o token já expirado, o logout local
    // acontece de qualquer forma — a pessoa não pode ficar presa por causa disso.
    if (estado.token) void acesso.sair().catch(() => {});
    configurarSessao(null);
    try { sessionStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
    cliente.clear();
    setEstado({ usuario: null, token: null, aviso: aviso ?? null });
  }, [cliente, estado.token]);

  useEffect(() => {
    configurarSessao(estado.token, () => sair('Sua sessão expirou. Entre de novo para continuar.'));
    if (!estado.token) return;
    const restante = expiraEm(estado.token) - Date.now();
    const timer = setTimeout(() => sair('Sua sessão expirou. Entre de novo para continuar.'), Math.max(0, restante));
    return () => clearTimeout(timer);
  }, [estado.token, sair]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const { usuario, token } = await acesso.entrar(email, senha);
    configurarSessao(token);
    try { sessionStorage.setItem(CHAVE, JSON.stringify({ usuario, token })); } catch { /* sem armazenamento */ }
    setEstado({ usuario, token, aviso: null });
  }, []);

  const valor = useMemo(() => ({ usuario: estado.usuario, aviso: estado.aviso, entrar, sair }), [estado.usuario, estado.aviso, entrar, sair]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const sessao = useContext(Contexto);
  if (!sessao) throw new Error('useSessao fora do ProvedorSessao');
  return sessao;
}

/** Usuário logado; só para telas que já estão atrás da proteção de rota. */
export function useUsuario(): Usuario {
  const { usuario } = useSessao();
  if (!usuario) throw new Error('Tela protegida sem usuário');
  return usuario;
}
