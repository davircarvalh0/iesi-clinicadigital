import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { inicioDoPerfil } from '../../app/perfis';
import { useSessao } from '../../app/sessao';
import { motivo, statusDe } from '../../api/cliente';
import { acesso } from '../../api/servicos';
import { Aviso, Campo } from '../../ui/componentes';

type Modo = 'entrar' | 'recuperar' | 'redefinir';

export function TelaEntrar() {
  const { usuario, entrar, aviso } = useSessao();
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [mensagemConta, setMensagemConta] = useState<string | null>(null);

  if (usuario) return <Navigate to={inicioDoPerfil(usuario.perfil)} replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEntrando(true);
    try {
      await entrar(email.trim(), senha);
    } catch (falha) {
      const status = statusDe(falha);
      setErro(status === 401 || status === 400 ? 'E-mail ou senha não conferem.' : status === 429 ? `${motivo(falha)}.` : `Não foi possível entrar: ${motivo(falha)}.`);
      setSenha('');
    } finally {
      setEntrando(false);
    }
  };

  const irPara = (novo: Modo) => { setErro(null); setMensagemConta(null); setModo(novo); };

  return (
    <div className="entrada">
      <div className="entrada__cartao">
        <div className="marca">
          <svg className="marca__simbolo marca__simbolo--grande" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M12 3h8a2 2 0 0 1 2 2v7h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7v7a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-7H3a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h7V5a2 2 0 0 1 2-2z" transform="translate(1.5 1.5) scale(.9)"/></svg>
          <span className="marca__texto"><strong>Clínica Digital</strong><span>Agenda, cadastro e lembretes</span></span>
        </div>

        {modo === 'entrar' && (
          <form onSubmit={enviar} className="formulario-entrada" noValidate={false}>
            <h1 className="formulario-entrada__titulo">Entrar</h1>
            <p className="formulario-entrada__texto">Use o e-mail e a senha que a administração cadastrou para você.</p>
            {mensagemConta && <Aviso tom="ok">{mensagemConta}</Aviso>}
            {aviso && <Aviso tom="info">{aviso}</Aviso>}
            <Campo rotulo="E-mail">
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </Campo>
            <Campo rotulo="Senha">
              <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
            </Campo>
            {erro && <Aviso tom="perigo">{erro}</Aviso>}
            <button className="botao botao--primario botao--grande" disabled={entrando}>{entrando ? 'Entrando…' : 'Entrar'}</button>
            <button type="button" className="botao botao--quieto" onClick={() => irPara('recuperar')}>Esqueci minha senha</button>
            <p className="formulario-entrada__rodape">Protótipo acadêmico. Use somente dados fictícios.</p>
          </form>
        )}

        {modo === 'recuperar' && <FormularioRecuperar aoEnviado={(msg) => { setMensagemConta(msg); setModo('redefinir'); }} aoVoltar={() => irPara('entrar')} aoTerCodigo={() => irPara('redefinir')} />}
        {modo === 'redefinir' && <FormularioRedefinir mensagemInicial={mensagemConta} aoConcluido={() => { setSenha(''); setMensagemConta('Senha alterada. Entre com a nova senha.'); setModo('entrar'); }} aoVoltar={() => irPara('entrar')} />}
      </div>
    </div>
  );
}

function FormularioRecuperar({ aoEnviado, aoVoltar, aoTerCodigo }: { aoEnviado: (mensagem: string) => void; aoVoltar: () => void; aoTerCodigo: () => void }) {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const { mensagem } = await acesso.recuperarSenha(email.trim());
      aoEnviado(mensagem);
    } catch (falha) {
      const status = statusDe(falha);
      setErro(status === 429 ? `${motivo(falha)}.` : `Não foi possível enviar: ${motivo(falha)}.`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="formulario-entrada">
      <h1 className="formulario-entrada__titulo">Recuperar senha</h1>
      <p className="formulario-entrada__texto">Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um código para redefinir a senha.</p>
      <Campo rotulo="E-mail">
        <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Campo>
      {erro && <Aviso tom="perigo">{erro}</Aviso>}
      <button className="botao botao--primario botao--grande" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar código'}</button>
      <button type="button" className="botao botao--quieto" onClick={aoTerCodigo}>Já tenho um código</button>
      <button type="button" className="botao botao--quieto" onClick={aoVoltar}>Voltar para entrar</button>
    </form>
  );
}

function FormularioRedefinir({ mensagemInicial, aoConcluido, aoVoltar }: { mensagemInicial: string | null; aoConcluido: () => void; aoVoltar: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await acesso.redefinirSenha(codigo.trim(), novaSenha);
      aoConcluido();
    } catch (falha) {
      const status = statusDe(falha);
      setErro(status === 400 || status === 429 ? `${motivo(falha)}.` : `Não foi possível trocar a senha: ${motivo(falha)}.`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="formulario-entrada">
      <h1 className="formulario-entrada__titulo">Trocar senha</h1>
      {mensagemInicial
        ? <Aviso tom="ok">{mensagemInicial}</Aviso>
        : <p className="formulario-entrada__texto">Informe o código recebido e a nova senha.</p>}
      <Campo rotulo="Código"><input required value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus /></Campo>
      <Campo rotulo="Nova senha" dica="Pelo menos 12 caracteres.">
        <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
      </Campo>
      {erro && <Aviso tom="perigo">{erro}</Aviso>}
      <button className="botao botao--primario botao--grande" disabled={enviando}>{enviando ? 'Trocando…' : 'Trocar senha'}</button>
      <button type="button" className="botao botao--quieto" onClick={aoVoltar}>Voltar para entrar</button>
    </form>
  );
}
