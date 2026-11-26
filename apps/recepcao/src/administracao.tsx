import { useState, type FormEvent } from 'react';
import type { Perfil, Profissional, Usuario } from './acesso';
import { requisitar } from './api/http';
import { usePolling } from './hooks/usePolling';

type ErroFila = { idEvento: string | null; tipo: string | null; motivo: string; tentativas: number; reprocessavel: boolean; jaProcessado: boolean };
type Reprocessamento = { id: string; idEvento: string; solicitante: string; resultado: string; solicitadoEm: string };
const profissionaisApi = () => requisitar<Profissional[]>('/api/agendamento/profissionais');
const usuariosApi = () => requisitar<(Usuario & { email: string })[]>('/api/cadastro/usuarios');
const errosApi = () => requisitar<ErroFila[]>('/api/notificacao/operacao/erros');
const historicoApi = () => requisitar<Reprocessamento[]>('/api/notificacao/operacao/reprocessamentos');
export function TelaAdministracao() {
  const profissionais = usePolling(profissionaisApi, 15000);
  const usuarios = usePolling(usuariosApi, 15000);
  const erros = usePolling(errosApi, 15000);
  const historico = usePolling(historicoApi, 15000);
  const [perfil, setPerfil] = useState<Perfil>('recepcionista');
  const [mensagem, setMensagem] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function executar(acao: () => Promise<unknown>) {
    if (ocupado) return;
    setOcupado(true); setMensagem('');
    try { await acao(); setMensagem('Operação concluída.'); }
    catch (e) { setMensagem(e instanceof Error ? e.message : 'Falha na operação.'); }
    finally { setOcupado(false); }
  }
  function criar(e: FormEvent<HTMLFormElement>, tipo: 'profissional' | 'usuario') {
    e.preventDefault(); const form = e.currentTarget; const dados = Object.fromEntries(new FormData(form));
    if (tipo === 'usuario' && perfil !== 'profissional') delete dados.profissionalId;
    void executar(async () => {
      await requisitar(tipo === 'profissional' ? '/api/agendamento/profissionais' : '/api/cadastro/usuarios', { method: 'POST', body: JSON.stringify(dados) });
      form.reset(); setPerfil('recepcionista');
      await Promise.all([profissionais.recarregar(), usuarios.recarregar()]);
    });
  }
  return <><h1>Administração</h1>{mensagem && <p role="status">{mensagem}</p>}
    <section className="cartao lista"><h2>Profissionais</h2>
      {profissionais.erro && <p>Cadastro indisponível.</p>}
      <form onSubmit={e => criar(e, 'profissional')}>
        <label className="campo">Nome<input name="nome" required /></label><label className="campo">Especialidade<input name="especialidade" required /></label>
        <button className="botao botao--primario" disabled={ocupado}>Cadastrar profissional</button>
      </form><ul>{profissionais.dados?.map(p => <li key={p.id}>{p.nome} — {p.especialidade}</li>)}</ul>
    </section>
    <section className="cartao lista"><h2>Usuários</h2>{usuarios.erro && <p>Usuários indisponíveis.</p>}
      <form onSubmit={e => criar(e, 'usuario')}>
        <label className="campo">Nome<input name="nome" required /></label><label className="campo">E-mail<input name="email" type="email" required /></label>
        <label className="campo">Senha inicial<input name="senha" type="password" minLength={12} required /></label>
        <label className="campo">Perfil<select name="perfil" value={perfil} onChange={e => setPerfil(e.target.value as Perfil)}><option value="recepcionista">Recepcionista</option><option value="profissional">Profissional</option><option value="administrador">Administrador</option></select></label>
        {perfil === 'profissional' && <label className="campo">Profissional<select name="profissionalId" required><option value="">Selecione</option>{profissionais.dados?.map(p => <option value={p.id} key={p.id}>{p.nome}</option>)}</select></label>}
        <button className="botao botao--primario" disabled={ocupado}>Cadastrar usuário</button>
      </form><ul>{usuarios.dados?.map(u => <li key={u.id}>{u.nome} · {u.email} · {u.perfil}</li>)}</ul>
    </section>
    <section className="cartao lista"><h2>Fila de erros</h2>{erros.erro && <p>Fila indisponível.</p>}{erros.dados?.length === 0 && <p>Nenhum evento na fila.</p>}
      {erros.dados?.map((e, i) => <article key={`${e.idEvento}-${i}`}><p>{e.tipo ?? 'Evento desconhecido'} · {e.motivo} · {e.tentativas} tentativa(s)</p><button className="botao botao--secundario" disabled={ocupado || !e.reprocessavel || !e.idEvento} onClick={() => { if (window.confirm('Solicitar reprocessamento deste evento?')) void executar(async () => { await requisitar(`/api/notificacao/operacao/erros/${encodeURIComponent(e.idEvento!)}/reprocessar`, { method: 'POST', body: '{}' }); await Promise.all([erros.recarregar(), historico.recarregar()]); }); }}>Reprocessar</button></article>)}
    </section>
    <section className="cartao lista"><h2>Histórico de reprocessamentos</h2>{historico.erro && <p>Histórico indisponível.</p>}{historico.dados?.length === 0 && <p>Nenhum registro.</p>}
      <ul>{historico.dados?.map(h => <li key={h.id}>{h.idEvento} · {h.solicitante} · {h.resultado} · {new Date(h.solicitadoEm).toLocaleString('pt-BR')}</li>)}</ul>
    </section></>;
}
