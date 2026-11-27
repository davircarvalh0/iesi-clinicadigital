import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Acesso, AgendaProfissional } from './acesso';
import { PortalPaciente } from './portal';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Acesso renderizar={(usuario, sair) => {
      if (usuario.perfil === 'profissional') return <AgendaProfissional usuario={usuario} sair={sair} />;
      if (usuario.perfil === 'paciente') return <PortalPaciente usuario={usuario} sair={sair} />;
      return <App usuario={usuario} sair={sair} />;
    }} />
  </StrictMode>,
);
