import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Acesso, AgendaProfissional } from './acesso';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Acesso renderizar={(usuario, sair) => usuario.perfil === 'profissional' ? <AgendaProfissional usuario={usuario} sair={sair} /> : <App usuario={usuario} sair={sair} />} />
  </StrictMode>,
);
