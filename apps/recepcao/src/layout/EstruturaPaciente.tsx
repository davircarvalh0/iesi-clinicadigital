import { User } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router';
import { useSessao, useUsuario } from '../app/sessao';
import { DialogoMinhaConta } from './DialogoMinhaConta';

/** Área do paciente: separada da recepção, sem menu nem painéis de equipe — só o essencial. */
export function EstruturaPaciente() {
  const usuario = useUsuario();
  const { sair } = useSessao();
  const [minhaConta, setMinhaConta] = useState(false);

  return (
    <div className="portal-estrutura">
      <a href="#conteudo" className="pular">Ir para o conteúdo</a>
      <header className="portal-topo">
        <div className="marca">
          <svg className="marca__simbolo" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M12 3h8a2 2 0 0 1 2 2v7h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7v7a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-7H3a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h7V5a2 2 0 0 1 2-2z" transform="translate(1.5 1.5) scale(.9)"/></svg>
          <span className="marca__texto"><strong>Clínica Digital</strong><span>Portal do paciente</span></span>
        </div>
        <div className="portal-topo__pessoa">
          <span className="portal-topo__nome">{usuario.nome}</span>
          <button type="button" className="botao botao--quieto" onClick={() => setMinhaConta(true)}>
            <User size={16} aria-hidden="true" /> Meus dados
          </button>
          <button type="button" className="botao botao--quieto" onClick={() => sair()}>Sair</button>
        </div>
      </header>
      <main id="conteudo" className="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
      {minhaConta && <DialogoMinhaConta aoFechar={() => setMinhaConta(false)} />}
    </div>
  );
}
