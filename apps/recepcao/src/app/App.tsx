import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import type { Perfil } from '../api/tipos';
import { Estrutura } from '../layout/Estrutura';
import { TelaEquipe } from '../telas/administracao/TelaEquipe';
import { TelaOperacao } from '../telas/administracao/TelaOperacao';
import { TelaAgenda } from '../telas/agenda/TelaAgenda';
import { TelaEntrar } from '../telas/entrar/TelaEntrar';
import { TelaLembretes } from '../telas/lembretes/TelaLembretes';
import { TelaPaciente } from '../telas/pacientes/TelaPaciente';
import { TelaPacientes } from '../telas/pacientes/TelaPacientes';
import { TelaMinhaAgenda } from '../telas/profissional/TelaMinhaAgenda';
import { inicioDoPerfil, RECEPCAO } from './perfis';
import { ProvedorSessao, useSessao } from './sessao';

const cliente = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true, staleTime: 0 },
    mutations: { retry: false },
  },
});

function Protegida({ perfis, children }: { perfis: Perfil[]; children: ReactNode }) {
  const { usuario } = useSessao();
  const local = useLocation();
  if (!usuario) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;
  if (!perfis.includes(usuario.perfil)) return <Navigate to={inicioDoPerfil(usuario.perfil)} replace />;
  return <>{children}</>;
}

function Inicio() {
  const { usuario } = useSessao();
  return <Navigate to={usuario ? inicioDoPerfil(usuario.perfil) : '/entrar'} replace />;
}

export function App() {
  return (
    <QueryClientProvider client={cliente}>
      <ProvedorSessao>
        <BrowserRouter>
          <Routes>
            <Route path="/entrar" element={<TelaEntrar />} />
            <Route element={<Protegida perfis={['recepcionista', 'administrador', 'profissional']}><Estrutura /></Protegida>}>
              <Route path="/agenda" element={<Protegida perfis={RECEPCAO}><TelaAgenda /></Protegida>} />
              <Route path="/pacientes" element={<Protegida perfis={RECEPCAO}><TelaPacientes /></Protegida>} />
              <Route path="/pacientes/:id" element={<Protegida perfis={RECEPCAO}><TelaPaciente /></Protegida>} />
              <Route path="/lembretes" element={<Protegida perfis={RECEPCAO}><TelaLembretes /></Protegida>} />
              <Route path="/minha-agenda" element={<Protegida perfis={['profissional']}><TelaMinhaAgenda /></Protegida>} />
              <Route path="/administracao/equipe" element={<Protegida perfis={['administrador']}><TelaEquipe /></Protegida>} />
              <Route path="/administracao/operacao" element={<Protegida perfis={['administrador']}><TelaOperacao /></Protegida>} />
            </Route>
            <Route path="*" element={<Inicio />} />
          </Routes>
        </BrowserRouter>
      </ProvedorSessao>
    </QueryClientProvider>
  );
}
