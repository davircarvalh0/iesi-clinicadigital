import { Pencil, Search, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { cadastroApi, type Paciente, type PaginaPacientes } from '../api/cadastro';
import { iniciais, mascaraCpf, mascaraTelefone } from '../formatacao';
import { ModalContato } from './ModalContato';

export function TelaPacientes({ aoAtualizar }: { aoAtualizar: () => void }) {
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [tentativa, setTentativa] = useState(0);
  const [dados, setDados] = useState<PaginaPacientes>();
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando');
  const [editando, setEditando] = useState<Paciente | null>(null);
  const [mensagem, setMensagem] = useState('');
  useEffect(() => {
    const controle = new AbortController();
    setEstado('carregando');
    cadastroApi.listar(busca, pagina, controle.signal).then((resultado) => {
      if (!controle.signal.aborted) { setDados(resultado); setEstado('pronto'); }
    }).catch(() => { if (!controle.signal.aborted) setEstado('erro'); });
    return () => controle.abort();
  }, [busca, pagina, tentativa]);
  function pesquisar(e: FormEvent) {
    e.preventDefault(); setMensagem(''); setPagina(1); setBusca(texto.trim()); setTentativa((n) => n + 1);
  }
  function salvo(paciente: Paciente) {
    // Exibe o retorno confirmado pelo servidor, incluindo normalização e revisão.
    setDados((atual) => atual && { ...atual, pacientes: atual.pacientes.map((p) => p.id === paciente.id ? paciente : p) });
    setEditando(null); setMensagem('Contatos atualizados com sucesso.'); aoAtualizar();
  }
  const paginas = Math.max(1, Math.ceil((dados?.totalFiltrado ?? 0) / (dados?.tamanhoPagina ?? 20)));
  return (
    <section className="cartao lista pacientes" aria-labelledby="titulo-pacientes">
      <div className="lista__cabecalho">
        <h2 id="titulo-pacientes" className="lista__titulo"><Users size={19} aria-hidden="true" /> Cadastro de pacientes</h2>
        <button type="button" className="acao" onClick={() => { setTentativa((n) => n + 1); aoAtualizar(); }}>Atualizar</button>
      </div>
      <form className="pacientes__busca" onSubmit={pesquisar} role="search" aria-label="Buscar pacientes">
        <label className="campo">Buscar por nome ou CPF
          <input type="search" maxLength={120} placeholder="Digite o nome ou CPF" value={texto}
            onChange={(e) => setTexto(/^[\d.\-\s]+$/.test(e.target.value) ? mascaraCpf(e.target.value) : e.target.value)} />
        </label>
        <button className="botao botao--primario"><Search size={17} aria-hidden="true" /> Buscar</button>
      </form>
      {mensagem && <p className="aviso pacientes__mensagem" role="status">{mensagem}</p>}
      {estado === 'carregando' && <p className="lista__vazia" role="status">Carregando pacientes…</p>}
      {estado === 'erro' && <div className="pacientes__estado" role="alert">
        <p className="aviso aviso--erro">Cadastro indisponível. Não foi possível carregar os pacientes.</p>
        <button className="botao botao--secundario" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</button>
      </div>}
      {estado === 'pronto' && dados && <>
        <p className="pacientes__resumo" role="status">{dados.totalFiltrado} resultado(s) · {dados.total} paciente(s) no cadastro mestre</p>
        {dados.pacientes.length === 0 ? <p className="lista__vazia">{busca ? 'Nenhum paciente encontrado para esta busca.' : 'Nenhum paciente cadastrado. Os agendamentos alimentam o cadastro automaticamente.'}</p>
          : <ul className="pacientes__lista">{dados.pacientes.map((p) => <li className="paciente" key={p.id}>
            <span className="avatar avatar--verde" aria-hidden="true">{iniciais(p.nome)}</span>
            <div className="paciente__dados"><h3>{p.nome}</h3><span>CPF {mascaraCpf(p.cpf)}</span>
              <span>{mascaraTelefone(p.telefone)}</span><span>{p.email ?? 'E-mail não informado'}</span>
            </div>
            <button className="acao" aria-label={`Editar contatos de ${p.nome}`} onClick={() => { setMensagem(''); setEditando(p); }}>
              <Pencil size={15} aria-hidden="true" /> Editar contatos
            </button>
          </li>)}</ul>}
        {paginas > 1 && <nav className="pacientes__paginacao" aria-label="Paginação de pacientes">
          <button className="botao botao--secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
          <span>Página {pagina} de {paginas}</span>
          <button className="botao botao--secundario" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
        </nav>}
      </>}
      {editando && <ModalContato key={editando.id} paciente={editando} aoFechar={() => setEditando(null)} aoSalvar={salvo}
        aoRecarregar={() => { setEditando(null); setTentativa((n) => n + 1); aoAtualizar(); }} />}
    </section>
  );
}
