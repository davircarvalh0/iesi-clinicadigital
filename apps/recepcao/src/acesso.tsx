import { useEffect, useState, type FormEvent } from 'react';
import { definirToken, requisitar } from './api/http';
import { agendamentoApi } from './api/agendamento';
import { usePolling } from './hooks/usePolling';
import { dataHora } from './formatacao';

export type Perfil = 'administrador' | 'recepcionista' | 'profissional';
export interface Usuario { id: string; nome: string; perfil: Perfil; profissionalId: string | null }
export interface Profissional { id: string; nome: string; especialidade: string }
export function Acesso({ renderizar }: { renderizar: (usuario: Usuario, sair: () => void) => React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const sair = () => { definirToken(null); setUsuario(null); setSenha(''); };
  useEffect(() => { window.addEventListener('sessao-expirada', sair); return () => window.removeEventListener('sessao-expirada', sair); }, []);
  async function entrar(e: FormEvent) {
    e.preventDefault(); setErro(''); setCarregando(true);
    try {
      const resultado = await requisitar<{ usuario: Usuario; token: string }>('/api/cadastro/usuarios/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
      definirToken(resultado.token); setUsuario(resultado.usuario); setSenha('');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível entrar.'); }
    finally { setCarregando(false); }
  }
  if (usuario) return <>{renderizar(usuario, sair)}</>;
  return <main className="principal" style={{ maxWidth: 460, margin: '8vh auto' }}><form className="modal" onSubmit={entrar}>
    <h1 className="modal__titulo">Clínica Digital · Entrar</h1>
    <label className="campo campo--inteiro">E-mail<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="campo campo--inteiro">Senha<input type="password" autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} /></label>
    {erro && <p role="alert" className="aviso aviso--erro campo--inteiro">{erro}</p>}
    <button className="botao botao--primario campo--inteiro" disabled={carregando}>Entrar</button>
  </form></main>;
}
export function AgendaProfissional({ usuario, sair }: { usuario: Usuario; sair: () => void }) {
  const consultas = usePolling(agendamentoApi.listar, 15000);
  return <main className="principal"><header className="cabecalho"><h1>Minha agenda · {usuario.nome}</h1><button className="botao botao--secundario" onClick={sair}>Sair</button></header>
    {consultas.erro && <p role="alert">Não foi possível atualizar a agenda.</p>}
    {consultas.dados?.map(c => <article className="cartao lista" key={c.id}><p>{dataHora(c.inicio)} · {c.pacienteNome} · {c.status}</p></article>)}
    {consultas.dados?.length === 0 && <p>Nenhuma consulta cadastrada.</p>}
  </main>;
}
