import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { motivo, statusDe } from '../api/cliente';
import { cadastro } from '../api/servicos';
import { useSessao, useUsuario } from '../app/sessao';
import { Aviso, Campo, Sobreposicao } from '../ui/componentes';

/**
 * US-25: autoatendimento da própria conta. Só pede o nome (não o e-mail): a sessão guarda o e-mail
 * de ninguém — só um administrador vê isso na tela de Equipe — então não daria para mostrar o valor
 * atual antes de deixar a pessoa trocá-lo, e trocar às cegas arrisca travar o próprio acesso.
 */
export function DialogoMinhaConta({ aoFechar }: { aoFechar: () => void }) {
  return (
    <Sobreposicao titulo="Minha conta" largura="estreita" aoFechar={aoFechar}>
      <SecaoNome />
      <SecaoSenha />
    </Sobreposicao>
  );
}

function SecaoNome() {
  const usuario = useUsuario();
  const { atualizarUsuario } = useSessao();
  const [nome, setNome] = useState(usuario.nome);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'perigo'; texto: string } | null>(null);

  const salvar = useMutation({
    mutationFn: () => cadastro.atualizarMinhaConta({ nome: nome.trim() }),
    onSuccess: () => { atualizarUsuario({ ...usuario, nome: nome.trim() }); setAviso({ tom: 'ok', texto: 'Nome salvo.' }); },
    onError: (e) => setAviso({ tom: 'perigo', texto: statusDe(e) === 409 ? 'E-mail já cadastrado.' : `Não foi possível salvar: ${motivo(e)}.` }),
  });

  const enviar = (e: FormEvent) => { e.preventDefault(); if (salvar.isPending) return; setAviso(null); salvar.mutate(); };
  const inalterado = nome.trim() === usuario.nome;

  return (
    <form className="formulario" onSubmit={enviar}>
      <h3 className="formulario__titulo">Nome</h3>
      <Campo rotulo="Nome"><input required minLength={3} maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      <div className="formulario__acoes">
        <button type="submit" className="botao botao--primario" disabled={inalterado || salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar nome'}</button>
      </div>
    </form>
  );
}

function SecaoSenha() {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'perigo'; texto: string } | null>(null);

  const salvar = useMutation({
    mutationFn: () => cadastro.trocarSenha(senhaAtual, novaSenha),
    onSuccess: () => { setAviso({ tom: 'ok', texto: 'Senha alterada.' }); setSenhaAtual(''); setNovaSenha(''); },
    onError: (e) => setAviso({ tom: 'perigo', texto: statusDe(e) === 400 ? `${motivo(e)}.` : `Não foi possível trocar a senha: ${motivo(e)}.` }),
  });

  const enviar = (e: FormEvent) => { e.preventDefault(); if (salvar.isPending) return; setAviso(null); salvar.mutate(); };

  return (
    <form className="formulario formulario--separado" onSubmit={enviar}>
      <h3 className="formulario__titulo">Trocar senha</h3>
      <Campo rotulo="Senha atual"><input type="password" autoComplete="current-password" required value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} /></Campo>
      <Campo rotulo="Nova senha" dica="Pelo menos 12 caracteres.">
        <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
      </Campo>
      <p className="nota">As outras sessões abertas (outro computador) são encerradas; esta continua.</p>
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      <div className="formulario__acoes">
        <button type="submit" className="botao botao--primario" disabled={salvar.isPending}>{salvar.isPending ? 'Trocando…' : 'Trocar senha'}</button>
      </div>
    </form>
  );
}
