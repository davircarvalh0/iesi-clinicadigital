import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Pencil, Search } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useSessao, useUsuario } from '../../app/sessao';
import { motivo, statusDe } from '../../api/cliente';
import { agendamento, cadastro } from '../../api/servicos';
import type { PacienteDetalhado, Perfil, Profissional, UsuarioListado } from '../../api/tipos';
import { cpfCompleto, mascararCpfDigitado, soDigitos, telefone } from '../../dominio/documentos';
import { Aviso, CabecalhoTela, Campo, Carregando, Confirmacao, Selo, Sobreposicao } from '../../ui/componentes';
import { GavetaDisponibilidade } from './GavetaDisponibilidade';

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
  const [editando, setEditando] = useState<Profissional | null>(null);
  const [configurando, setConfigurando] = useState<Profissional | null>(null);
  const [desativando, setDesativando] = useState<Profissional | null>(null);
  const [erroDesativar, setErroDesativar] = useState<string | null>(null);

  const cadastrar = useMutation({
    mutationFn: () => agendamento.cadastrarProfissional({ nome: nome.trim(), especialidade: especialidade.trim() }),
    onSuccess: (p) => { setAviso({ tom: 'ok', texto: `${p.nome} cadastrado.` }); setNome(''); setEspecialidade(''); void cliente.invalidateQueries({ queryKey: ['profissionais'] }); },
    onError: (e) => setAviso({ tom: 'perigo', texto: statusDe(e) === 409 ? 'Já existe um profissional com esse nome.' : `Não foi possível cadastrar: ${motivo(e)}.` }),
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); setAviso(null); cadastrar.mutate(); };

  const definirStatus = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) => agendamento.definirStatusProfissional(id, ativo),
    onSuccess: () => { setDesativando(null); setErroDesativar(null); void cliente.invalidateQueries({ queryKey: ['profissionais'] }); },
    onError: (e) => {
      const texto = `Não foi possível alterar: ${motivo(e)}.`;
      // Ativar não tem diálogo (ação direta); desativar mostra o erro dentro do diálogo aberto.
      if (desativando) setErroDesativar(texto); else setAviso({ tom: 'perigo', texto });
    },
  });

  return (
    <section className="bloco" aria-labelledby="titulo-profissionais">
      <h2 id="titulo-profissionais" className="bloco__titulo">Profissionais</h2>
      {lista.isPending && <Carregando />}
      {lista.isError && <Aviso tom="perigo">Não foi possível carregar: {motivo(lista.error)}.</Aviso>}
      {lista.data?.length === 0 && <p className="nota">Nenhum profissional ainda. Sem eles não dá para agendar consultas.</p>}
      <ul className="lista-simples">
        {lista.data?.map((p) => (
          <li key={p.id}>
            <strong>{p.nome}</strong>
            <span>{p.especialidade}</span>
            <div className="lista-simples__acoes">
              {!p.ativo && <Selo tom="perigo">Inativo</Selo>}
              <button type="button" className="botao botao--quieto botao--icone" onClick={() => setEditando(p)} aria-label={`Editar ${p.nome}`}>
                <Pencil size={15} aria-hidden="true" />
              </button>
              <button type="button" className="botao botao--quieto botao--icone" onClick={() => setConfigurando(p)} aria-label={`Horários de ${p.nome}`}>
                <Clock size={15} aria-hidden="true" />
              </button>
              <button type="button" className="botao botao--quieto" disabled={definirStatus.isPending}
                onClick={() => (p.ativo ? setDesativando(p) : definirStatus.mutate({ id: p.id, ativo: true }))}>
                {p.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </li>
        ))}
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

      {editando && (
        <DialogoEditarProfissional
          profissional={editando}
          aoFechar={() => setEditando(null)}
          aoSalvo={() => { setEditando(null); void cliente.invalidateQueries({ queryKey: ['profissionais'] }); }}
        />
      )}
      {configurando && <GavetaDisponibilidade profissional={configurando} aoFechar={() => setConfigurando(null)} />}
      {desativando && (
        <Confirmacao
          titulo={`Desativar ${desativando.nome}?`}
          confirmar="Desativar"
          perigo
          ocupado={definirStatus.isPending}
          erro={erroDesativar}
          aoFechar={() => { setDesativando(null); setErroDesativar(null); }}
          aoConfirmar={() => definirStatus.mutate({ id: desativando.id, ativo: false })}
        >
          <p>Profissional inativo não recebe novas consultas. As consultas já marcadas continuam normalmente.</p>
        </Confirmacao>
      )}
    </section>
  );
}

type PacienteEncontrado = Pick<PacienteDetalhado, 'id' | 'cpf' | 'nome' | 'telefone'>;
type BuscaPaciente =
  | { estado: 'inicial' | 'buscando' | 'nao-encontrado' | 'indisponivel' }
  | { estado: 'encontrado'; paciente: PacienteEncontrado };

function DialogoEditarProfissional({ profissional, aoFechar, aoSalvo }: { profissional: Profissional; aoFechar: () => void; aoSalvo: () => void }) {
  const [nome, setNome] = useState(profissional.nome);
  const [especialidade, setEspecialidade] = useState(profissional.especialidade);
  const [duracao, setDuracao] = useState(profissional.duracaoConsultaMinutos);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: () => agendamento.atualizarProfissional(profissional.id, {
      nome: nome.trim(), especialidade: especialidade.trim(), duracaoConsultaMinutos: duracao,
    }),
    onSuccess: aoSalvo,
    onError: (e) => setErro(statusDe(e) === 409 ? 'Já existe um profissional com esse nome.' : `Não foi possível salvar: ${motivo(e)}.`),
  });

  const enviar = (e: FormEvent) => { e.preventDefault(); if (salvar.isPending) return; setErro(null); salvar.mutate(); };

  return (
    <Sobreposicao titulo={`Editar ${profissional.nome}`} largura="estreita" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="botao botao--quieto" onClick={aoFechar}>Voltar</button>
        <button type="submit" form="editar-profissional" className="botao botao--primario" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <form id="editar-profissional" className="formulario" onSubmit={enviar}>
        <Campo rotulo="Nome"><input required minLength={3} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Especialidade"><input required minLength={2} maxLength={120} value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} /></Campo>
        <Campo rotulo="Duração de cada consulta (minutos)" dica="De 5 a 240 minutos.">
          <input type="number" required min={5} max={240} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} />
        </Campo>
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </form>
    </Sobreposicao>
  );
}

function Usuarios() {
  const cliente = useQueryClient();
  const eu = useUsuario();
  const { atualizarUsuario } = useSessao();
  const lista = useQuery({ queryKey: ['usuarios'], queryFn: ({ signal }) => cadastro.usuarios(signal) });
  const profissionais = useQuery({ queryKey: ['profissionais'], queryFn: ({ signal }) => agendamento.profissionais(signal) });
  const [form, setForm] = useState({ nome: '', email: '', senha: '', perfil: 'recepcionista' as Perfil, profissionalId: '', cpf: '' });
  const [buscaPaciente, setBuscaPaciente] = useState<BuscaPaciente>({ estado: 'inicial' });
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'perigo'; texto: string } | null>(null);
  const [editando, setEditando] = useState<UsuarioListado | null>(null);
  const [desativando, setDesativando] = useState<UsuarioListado | null>(null);
  const [erroDesativar, setErroDesativar] = useState<string | null>(null);
  const pedidoCpf = useRef<AbortController | null>(null);
  const mudar = (dados: Partial<typeof form>) => setForm((f) => ({ ...f, ...dados }));
  const nomeProfissional = (id: string | null) => profissionais.data?.find((p) => p.id === id)?.nome;

  const pacienteEncontrado = buscaPaciente.estado === 'encontrado' ? buscaPaciente.paciente : null;

  const mudarPerfil = (perfil: Perfil) => {
    pedidoCpf.current?.abort();
    setBuscaPaciente({ estado: 'inicial' });
    mudar({ perfil, profissionalId: '', cpf: '', nome: perfil === 'paciente' ? '' : form.nome });
  };

  const buscarPaciente = async (valor: string) => {
    if (!cpfCompleto(valor)) return;
    pedidoCpf.current?.abort();
    const controle = new AbortController();
    pedidoCpf.current = controle;
    setBuscaPaciente({ estado: 'buscando' });
    try {
      const { paciente } = await cadastro.buscarCpf(valor, controle.signal);
      if (controle.signal.aborted) return;
      if (paciente) { setBuscaPaciente({ estado: 'encontrado', paciente }); mudar({ nome: paciente.nome }); }
      else setBuscaPaciente({ estado: 'nao-encontrado' });
    } catch {
      if (!controle.signal.aborted) setBuscaPaciente({ estado: 'indisponivel' });
    }
  };

  const mudarCpf = (valor: string) => {
    const mascarado = mascararCpfDigitado(valor);
    if (soDigitos(mascarado) === soDigitos(form.cpf)) { mudar({ cpf: mascarado }); return; }
    pedidoCpf.current?.abort();
    setBuscaPaciente({ estado: 'inicial' });
    mudar({ cpf: mascarado, nome: '' });
    if (cpfCompleto(mascarado)) void buscarPaciente(mascarado);
  };

  const prontoParaCriar = form.perfil !== 'paciente' || !!pacienteEncontrado;

  const cadastrar = useMutation({
    mutationFn: () => cadastro.cadastrarUsuario({
      nome: form.nome.trim(), email: form.email.trim(), senha: form.senha, perfil: form.perfil,
      profissionalId: form.perfil === 'profissional' ? form.profissionalId : null,
      pacienteId: form.perfil === 'paciente' ? pacienteEncontrado?.id : null,
    }),
    onSuccess: (u) => {
      setAviso({ tom: 'ok', texto: `Acesso criado para ${u.nome}. Entregue a senha inicial pessoalmente.` });
      setForm({ nome: '', email: '', senha: '', perfil: 'recepcionista', profissionalId: '', cpf: '' });
      setBuscaPaciente({ estado: 'inicial' });
      void cliente.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (e) => setAviso({ tom: 'perigo', texto: statusDe(e) === 409 ? `${motivo(e)}.` : `Não foi possível criar o acesso: ${motivo(e)}.` }),
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); if (!prontoParaCriar || cadastrar.isPending) return; setAviso(null); cadastrar.mutate(); };

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
        <Campo rotulo="Perfil">
          <select value={form.perfil} onChange={(e) => mudarPerfil(e.target.value as Perfil)}>
            <option value="recepcionista">Recepção</option>
            <option value="profissional">Profissional</option>
            <option value="administrador">Administração</option>
            <option value="paciente">Paciente</option>
          </select>
        </Campo>

        {form.perfil === 'paciente' && (
          <div className="busca-cpf">
            <Campo rotulo="CPF do paciente" dica="O paciente precisa já estar cadastrado em Pacientes.">
              <input inputMode="numeric" placeholder="000.000.000-00" value={form.cpf} autoComplete="off"
                onChange={(e) => mudarCpf(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscarPaciente(form.cpf); } }} />
            </Campo>
            <button type="button" className="botao botao--secundario" disabled={!cpfCompleto(form.cpf) || buscaPaciente.estado === 'buscando' || !!pacienteEncontrado}
              onClick={() => void buscarPaciente(form.cpf)}>
              <Search size={16} aria-hidden="true" /> {buscaPaciente.estado === 'indisponivel' ? 'Buscar de novo' : 'Buscar'}
            </button>
          </div>
        )}
        {form.perfil === 'paciente' && (
          <div role="status" className="busca-cpf__resultado">
            {buscaPaciente.estado === 'buscando' && <p className="nota">Procurando no Cadastro…</p>}
            {pacienteEncontrado && (
              <div className="paciente-encontrado">
                <CheckCircle2 size={20} aria-hidden="true" />
                <div>
                  <p className="paciente-encontrado__nome">{pacienteEncontrado.nome}</p>
                  <p className="paciente-encontrado__fone">{telefone(pacienteEncontrado.telefone)}</p>
                </div>
              </div>
            )}
            {buscaPaciente.estado === 'nao-encontrado' && <p className="nota">Esse CPF ainda não tem cadastro. Cadastre o paciente primeiro em "Pacientes".</p>}
            {buscaPaciente.estado === 'indisponivel' && <Aviso tom="alerta">O Cadastro não respondeu. Tente buscar de novo.</Aviso>}
          </div>
        )}

        <div className="formulario__linha">
          <Campo rotulo="Nome"><input required minLength={3} maxLength={80} value={form.nome} onChange={(e) => mudar({ nome: e.target.value })} /></Campo>
          <Campo rotulo="E-mail"><input type="email" required value={form.email} onChange={(e) => mudar({ email: e.target.value })} autoComplete="off" /></Campo>
        </div>
        <Campo rotulo="Senha inicial" dica="Pelo menos 12 caracteres."><input type="password" required minLength={12} maxLength={128} value={form.senha} onChange={(e) => mudar({ senha: e.target.value })} autoComplete="new-password" /></Campo>
        {form.perfil === 'profissional' && (
          <Campo rotulo="Agenda de qual profissional" dica="A pessoa verá só as consultas deste profissional.">
            <select required value={form.profissionalId} onChange={(e) => mudar({ profissionalId: e.target.value })}>
              <option value="">Escolha</option>
              {profissionais.data?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        )}
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
        <div className="formulario__acoes"><button className="botao botao--primario" disabled={!prontoParaCriar || cadastrar.isPending}>{cadastrar.isPending ? 'Criando…' : 'Criar acesso'}</button></div>
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
