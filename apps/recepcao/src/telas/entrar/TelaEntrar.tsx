import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { inicioDoPerfil } from '../../app/perfis';
import { useSessao } from '../../app/sessao';
import { motivo, statusDe } from '../../api/cliente';
import { Aviso, Campo } from '../../ui/componentes';

export function TelaEntrar() {
  const { usuario, entrar, aviso } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  if (usuario) return <Navigate to={inicioDoPerfil(usuario.perfil)} replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEntrando(true);
    try {
      await entrar(email.trim(), senha);
    } catch (falha) {
      const status = statusDe(falha);
      setErro(status === 401 || status === 400 ? 'E-mail ou senha não conferem.' : status === 429 ? motivo(falha) : `Não foi possível entrar: ${motivo(falha)}.`);
      setSenha('');
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="entrada">
      <div className="entrada__cartao">
        <div className="marca">
          <svg className="marca__simbolo marca__simbolo--grande" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M12 3h8a2 2 0 0 1 2 2v7h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7v7a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-7H3a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h7V5a2 2 0 0 1 2-2z" transform="translate(1.5 1.5) scale(.9)"/></svg>
          <span className="marca__texto"><strong>Clínica Digital</strong><span>Agenda, cadastro e lembretes</span></span>
        </div>
        <form onSubmit={enviar} className="formulario-entrada" noValidate={false}>
          <h1 className="formulario-entrada__titulo">Entrar</h1>
          <p className="formulario-entrada__texto">Use o e-mail e a senha que a administração cadastrou para você.</p>
          {aviso && <Aviso tom="info">{aviso}</Aviso>}
          <Campo rotulo="E-mail">
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Campo>
          <Campo rotulo="Senha">
            <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          {erro && <Aviso tom="perigo">{erro}</Aviso>}
          <button className="botao botao--primario botao--grande" disabled={entrando}>{entrando ? 'Entrando…' : 'Entrar'}</button>
          <p className="formulario-entrada__rodape">Protótipo acadêmico. Use somente dados fictícios.</p>
        </form>
      </div>
    </div>
  );
}
