import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { motivo, statusDe } from '../../api/cliente';
import { agendamento, cadastro } from '../../api/servicos';
import type { Perfil } from '../../api/tipos';
import { Aviso, CabecalhoTela, Campo, Carregando, Selo } from '../../ui/componentes';

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
  const lista = useQuery({ queryKey: ['usuarios'], queryFn: ({ signal }) => cadastro.usuarios(signal) });
  const profissionais = useQuery({ queryKey: ['profissionais'], queryFn: ({ signal }) => agendamento.profissionais(signal) });
  const [form, setForm] = useState({ nome: '', email: '', senha: '', perfil: 'recepcionista' as Perfil, profissionalId: '' });
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'perigo'; texto: string } | null>(null);
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
    </section>
  );
}
