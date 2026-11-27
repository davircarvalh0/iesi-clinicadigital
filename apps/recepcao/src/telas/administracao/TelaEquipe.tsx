import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSessao, useUsuario } from '../../app/sessao';
import { motivo, statusDe } from '../../api/cliente';
import { agendamento, cadastro } from '../../api/servicos';
import type { Perfil, Profissional, UsuarioListado } from '../../api/tipos';
import { Aviso, CabecalhoTela, Campo, Carregando, Confirmacao, Selo, Sobreposicao } from '../../ui/componentes';

const NOME_PERFIL: Record<Perfil, string> = { administrador: 'Administração', recepcionista: 'Recepção', profissional: 'Profissional', paciente: 'Paciente' };

export function TelaEquipe() {
  return (
    <div className="tela">
      <CabecalhoTela titulo="Equipe e acessos" descricao="Profissionais que atendem na clínica e as pessoas que podem entrar no sistema." />
      <div className="colunas colunas--iguais">
        <Profissionais />
        <Usuarios />
      </div>
    </div>
  );
}

function Profissionais() {
  const cliente = useQueryClient();
  const lista = useQuery({ queryKey: ['profissionais'], queryFn: ({ signal }) => agendamento.profissionais(signal) });
  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'perigo'; texto: string } | null>(null);
  const cadastrar = useMutation({
    mutationFn: () => agendamento.cadastrarProfissional({ nome: nome.trim(), especialidade: especialidade.trim() }),
    onSuccess: (p) => { setAviso({ tom: 'ok', texto: `${p.nome} cadastrado.` }); setNome(''); setEspecialidade(''); void cliente.invalidateQueries({ queryKey: ['profissionais'] }); },
    onError: (e) => setAviso({ tom: 'perigo', texto: statusDe(e) === 409 ? 'Já existe um profissional com esse nome.' : `Não foi possível cadastrar: ${motivo(e)}.` }),
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); setAviso(null); cadastrar.mutate(); };

  return (
    <section className="bloco" aria-labelledby="titulo-profissionais">
      <h2 id="titulo-profissionais" className="bloco__titulo">Profissionais</h2>
      {lista.isPending && <Carregando />}
      {lista.isError && <Aviso tom="perigo">Não foi possível carregar: {motivo(lista.error)}.</Aviso>}
      {lista.data?.length === 0 && <p className="nota">Nenhum profissional ainda. Sem eles não dá para agendar consultas.</p>}
      <ul className="lista-simples">
        {lista.data?.map((p) => <li key={p.id}><strong>{p.nome}</strong><span>{p.especialidade}</span></li>)}
      </ul>
      <form className="formulario formulario--separado" onSubmit={enviar}>
        <h3 className="formulario__titulo">Cadastrar profissional</h3>
        <div className="formulario__linha">
          <Campo rotulo="Nome"><input required minLength={3} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Dra. Ana Fictícia" /></Campo>
          <Campo rotulo="Especialidade"><input required minLength={2} maxLength={120} value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} placeholder="Cardiologia" /></Campo>
        </div>
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
        <div className="formulario__acoes"><button className="botao botao--primario" disabled={cadastrar.isPending}>{cadastrar.isPending ? 'Cadastrando…' : 'Cadastrar profissional'}</button></div>
      </form>
    </section>
  );
}

function Usuarios() {
  const cliente = useQueryClient();
  const eu = useUsuario();
  const { atualizarUsuario } = useSessao();
  const lista = useQuery({ queryKey: ['usuarios'], queryFn: ({ signal }) => cadastro.usuarios(signal) });
  const profissionais = useQuery({ queryKey: ['profissionais'], queryFn: ({ signal }) => agendamento.profissionais(signal) });
  const [form, setForm] = useState({ nome: '', email: '', senha: '', perfil: 'recepcionista' as Perfil, profissionalId: '' });
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'perigo'; texto: string } | null>(null);
  const [editando, setEditando] = useState<UsuarioListado | null>(null);
  const [desativando, setDesativando] = useState<UsuarioListado | null>(null);
  const [erroDesativar, setErroDesativar] = useState<string | null>(null);
  const mudar = (dados: Partial<typeof form>) => setForm((f) => ({ ...f, ...dados }));
  const nomeProfissional = (id: string | null) => profissionais.data?.find((p) => p.id === id)?.nome;

  const cadastrar = useMutation({
    mutationFn: () => cadastro.cadastrarUsuario({
      nome: form.nome.trim(), email: form.email.trim(), senha: form.senha, perfil: form.perfil,
      profissionalId: form.perfil === 'profissional' ? form.profissionalId : null,
    }),
    onSuccess: (u) => {
      setAviso({ tom: 'ok', texto: `Acesso criado para ${u.nome}. Entregue a senha inicial pessoalmente.` });
      setForm({ nome: '', email: '', senha: '', perfil: 'recepcionista', profissionalId: '' });
      void cliente.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (e) => setAviso({ tom: 'perigo', texto: statusDe(e) === 409 ? 'Já existe um acesso com esse e-mail.' : `Não foi possível criar o acesso: ${motivo(e)}.` }),
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); setAviso(null); cadastrar.mutate(); };

  const definirStatus = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) => cadastro.definirStatusUsuario(id, ativo),
    onSuccess: () => { setDesativando(null); setErroDesativar(null); void cliente.invalidateQueries({ queryKey: ['usuarios'] }); },
    onError: (e) => {
      const texto = `Não foi possível alterar: ${motivo(e)}.`;
      // Ativar não tem diálogo (ação direta); desativar mostra o erro dentro do diálogo aberto.
      if (desativando) setErroDesativar(texto); else setAviso({ tom: 'perigo', texto });
    },
  });

  return (
    <section className="bloco" aria-labelledby="titulo-usuarios">
      <h2 id="titulo-usuarios" className="bloco__titulo">Acessos ao sistema</h2>
      {lista.isPending && <Carregando />}
      {lista.isError && <Aviso tom="perigo">Não foi possível carregar: {motivo(lista.error)}.</Aviso>}
      <ul className="lista-simples">
        {lista.data?.map((u) => (
          <li key={u.id}>
            <strong>{u.nome}</strong>
            <span>{u.email}</span>
            <Selo tom={u.perfil === 'administrador' ? 'marca' : u.perfil === 'profissional' ? 'info' : 'neutro'}>
              {NOME_PERFIL[u.perfil]}{u.perfil === 'profissional' && nomeProfissional(u.profissionalId) ? `: ${nomeProfissional(u.profissionalId)}` : ''}
            </Selo>
            <div className="lista-simples__acoes">
              {!u.ativo && <Selo tom="perigo">Inativo</Selo>}
              <button type="button" className="botao botao--quieto botao--icone" onClick={() => setEditando(u)} aria-label={`Editar ${u.nome}`}>
                <Pencil size={15} aria-hidden="true" />
              </button>
              <button type="button" className="botao botao--quieto"
                disabled={(definirStatus.isPending && definirStatus.variables?.id === u.id) || (u.ativo && u.id === eu.id)}
                title={u.ativo && u.id === eu.id ? 'Você não pode desativar a própria conta.' : undefined}
                onClick={() => (u.ativo ? setDesativando(u) : definirStatus.mutate({ id: u.id, ativo: true }))}>
                {u.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form className="formulario formulario--separado" onSubmit={enviar}>
        <h3 className="formulario__titulo">Criar acesso</h3>
        <div className="formulario__linha">
          <Campo rotulo="Nome"><input required minLength={3} maxLength={80} value={form.nome} onChange={(e) => mudar({ nome: e.target.value })} /></Campo>
          <Campo rotulo="E-mail"><input type="email" required value={form.email} onChange={(e) => mudar({ email: e.target.value })} autoComplete="off" /></Campo>
        </div>
        <div className="formulario__linha">
          <Campo rotulo="Senha inicial" dica="Pelo menos 12 caracteres."><input type="password" required minLength={12} maxLength={128} value={form.senha} onChange={(e) => mudar({ senha: e.target.value })} autoComplete="new-password" /></Campo>
          <Campo rotulo="Perfil">
            <select value={form.perfil} onChange={(e) => mudar({ perfil: e.target.value as Perfil, profissionalId: '' })}>
              <option value="recepcionista">Recepção</option>
              <option value="profissional">Profissional</option>
              <option value="administrador">Administração</option>
            </select>
          </Campo>
        </div>
        {form.perfil === 'profissional' && (
          <Campo rotulo="Agenda de qual profissional" dica="A pessoa verá só as consultas deste profissional.">
            <select required value={form.profissionalId} onChange={(e) => mudar({ profissionalId: e.target.value })}>
              <option value="">Escolha</option>
              {profissionais.data?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        )}
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
        <div className="formulario__acoes"><button className="botao botao--primario" disabled={cadastrar.isPending}>{cadastrar.isPending ? 'Criando…' : 'Criar acesso'}</button></div>
      </form>

      {editando && (
        <DialogoEditarUsuario
          usuario={editando}
          profissionais={profissionais.data}
          aoFechar={() => setEditando(null)}
          aoSalvo={(u) => {
            setEditando(null);
            // A própria conta: reflete o nome novo na sessão, senão a barra lateral fica com o nome antigo.
            if (u.id === eu.id) atualizarUsuario({ id: u.id, nome: u.nome, perfil: u.perfil, profissionalId: u.profissionalId });
            void cliente.invalidateQueries({ queryKey: ['usuarios'] });
          }}
        />
      )}
      {desativando && (
        <Confirmacao
          titulo={`Desativar o acesso de ${desativando.nome}?`}
          confirmar="Desativar"
          perigo
          ocupado={definirStatus.isPending}
          erro={erroDesativar}
          aoFechar={() => { setDesativando(null); setErroDesativar(null); }}
          aoConfirmar={() => definirStatus.mutate({ id: desativando.id, ativo: false })}
        >
          <p>A pessoa deixa de conseguir entrar no sistema. O acesso pode ser reativado depois.</p>
        </Confirmacao>
      )}
    </section>
  );
}

function DialogoEditarUsuario({ usuario, profissionais, aoFechar, aoSalvo }: {
  usuario: UsuarioListado; profissionais: Profissional[] | undefined; aoFechar: () => void; aoSalvo: (usuario: UsuarioListado) => void;
}) {
  const ehPaciente = usuario.perfil === 'paciente';
  const [nome, setNome] = useState(usuario.nome);
  const [email, setEmail] = useState(usuario.email);
  const [perfil, setPerfil] = useState<Exclude<Perfil, 'paciente'>>(usuario.perfil === 'paciente' ? 'recepcionista' : usuario.perfil);
  const [profissionalId, setProfissionalId] = useState(usuario.profissionalId ?? '');
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: () => cadastro.atualizarUsuario(usuario.id, ehPaciente
      ? { nome: nome.trim(), email: email.trim() }
      : { nome: nome.trim(), email: email.trim(), perfil, profissionalId: perfil === 'profissional' ? profissionalId : null }),
    onSuccess: aoSalvo,
    // 409 aqui pode ser e-mail duplicado OU a recusa de tirar o último administrador ativo — a mensagem
    // do Cadastro já distingue os dois casos, então é só repassar em vez de supor qual foi.
    onError: (e) => setErro(statusDe(e) === 409 ? `${motivo(e)}.` : `Não foi possível salvar: ${motivo(e)}.`),
  });

  const enviar = (e: FormEvent) => { e.preventDefault(); if (salvar.isPending) return; setErro(null); salvar.mutate(); };

  return (
    <Sobreposicao titulo={`Editar ${usuario.nome}`} largura="estreita" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="botao botao--quieto" onClick={aoFechar}>Voltar</button>
        <button type="submit" form="editar-usuario" className="botao botao--primario" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <form id="editar-usuario" className="formulario" onSubmit={enviar}>
        <Campo rotulo="Nome"><input required minLength={3} maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="E-mail"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Campo>
        {ehPaciente ? (
          <p className="nota">Esta conta é de um paciente (portal); o perfil não muda por aqui.</p>
        ) : (
          <>
            <Campo rotulo="Perfil">
              <select value={perfil} onChange={(e) => setPerfil(e.target.value as Exclude<Perfil, 'paciente'>)}>
                <option value="recepcionista">Recepção</option>
                <option value="profissional">Profissional</option>
                <option value="administrador">Administração</option>
              </select>
            </Campo>
            {perfil === 'profissional' && (
              <Campo rotulo="Agenda de qual profissional" dica="A pessoa verá só as consultas deste profissional.">
                <select required value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
                  <option value="">Escolha</option>
                  {profissionais?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Campo>
            )}
          </>
        )}
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </form>
    </Sobreposicao>
  );
}
