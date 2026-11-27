import { Activity, Bell, CalendarDays, LogOut, Menu, Radio, ServerCog, User, UserCog, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { RECEPCAO } from '../app/perfis';
import { useLeitura } from '../app/leitura';
import { useSessao, useUsuario } from '../app/sessao';
import { saude, type NomeServico } from '../api/servicos';
import { DialogoMinhaConta } from './DialogoMinhaConta';
import { PainelIntegracao } from './PainelIntegracao';

const NOME_PERFIL = { administrador: 'Administração', recepcionista: 'Recepção', profissional: 'Profissional', paciente: 'Paciente' } as const;

function lerPreferencia(): boolean {
  try { return localStorage.getItem('clinica.integracao') === 'aberta'; } catch { return false; }
}

export function Estrutura() {
  const usuario = useUsuario();
  const { sair } = useSessao();
  const local = useLocation();
  const recepcao = RECEPCAO.includes(usuario.perfil);
  const [integracao, setIntegracao] = useState(lerPreferencia);
  const [menuAberto, setMenuAberto] = useState(false);
  const [minhaConta, setMinhaConta] = useState(false);

  useEffect(() => setMenuAberto(false), [local.pathname]);
  useEffect(() => {
    try { localStorage.setItem('clinica.integracao', integracao ? 'aberta' : 'fechada'); } catch { /* sem armazenamento */ }
  }, [integracao]);

  return (
    <div className={`estrutura ${recepcao && integracao ? 'estrutura--com-painel' : ''}`}>
      <a href="#conteudo" className="pular">Ir para o conteúdo</a>
      <aside className={`lateral ${menuAberto ? 'lateral--aberta' : ''}`}>
        <div className="marca">
          <svg className="marca__simbolo" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M12 3h8a2 2 0 0 1 2 2v7h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7v7a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-7H3a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h7V5a2 2 0 0 1 2-2z" transform="translate(1.5 1.5) scale(.9)"/></svg>
          <span className="marca__texto">
            <strong>Clínica Digital</strong>
            <span>Recepção e agenda</span>
          </span>
        </div>

        <nav className="navegacao" aria-label="Principal">
          {recepcao && <>
            <Item para="/agenda" icone={<CalendarDays size={19} />}>Agenda</Item>
            <Item para="/pacientes" icone={<Users size={19} />}>Pacientes</Item>
            <Item para="/lembretes" icone={<Bell size={19} />}>Lembretes</Item>
          </>}
          {usuario.perfil === 'profissional' && <Item para="/minha-agenda" icone={<CalendarDays size={19} />}>Minha agenda</Item>}
          {usuario.perfil === 'administrador' && <>
            <p className="navegacao__grupo">Administração</p>
            <Item para="/administracao/equipe" icone={<UserCog size={19} />}>Equipe e acessos</Item>
            <Item para="/administracao/operacao" icone={<ServerCog size={19} />}>Operação</Item>
          </>}
        </nav>

        <div className="lateral__pe">
          <div className="pessoa">
            <span className="pessoa__nome">{usuario.nome}</span>
            <span className="pessoa__perfil">{NOME_PERFIL[usuario.perfil]}</span>
          </div>
          <button type="button" className="botao botao--quieto botao--icone" onClick={() => setMinhaConta(true)} title="Minha conta" aria-label="Minha conta">
            <User size={18} />
          </button>
          <button type="button" className="botao botao--quieto botao--icone" onClick={() => sair()} title="Sair" aria-label="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      {menuAberto && <div className="lateral__fundo" onClick={() => setMenuAberto(false)} aria-hidden="true" />}
      {minhaConta && <DialogoMinhaConta aoFechar={() => setMinhaConta(false)} />}

      <div className="centro">
        <div className="barra-topo">
          <button type="button" className="botao botao--quieto botao--icone barra-topo__menu" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          {recepcao ? <SaudeServicos /> : <span />}
          {recepcao && (
            <button type="button" className={`botao botao--quieto ${integracao ? 'botao--ativo' : ''}`} aria-pressed={integracao} onClick={() => setIntegracao((v) => !v)}>
              <Radio size={17} aria-hidden="true" /> <span className="barra-topo__rotulo">Integração ao vivo</span>
            </button>
          )}
        </div>
        <main id="conteudo" className="conteudo" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      {recepcao && integracao && <PainelIntegracao aoFechar={() => setIntegracao(false)} />}
    </div>
  );
}

function Item({ para, icone, children }: { para: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink to={para} className={({ isActive }) => `navegacao__item ${isActive ? 'navegacao__item--ativo' : ''}`}>
      {icone}<span>{children}</span>
    </NavLink>
  );
}

const SERVICOS: { nome: NomeServico; rotulo: string }[] = [
  { nome: 'agendamento', rotulo: 'Agendamento' },
  { nome: 'cadastro', rotulo: 'Cadastro' },
  { nome: 'notificacao', rotulo: 'Notificação' },
];

/** Um ponto por serviço: respondendo, sem resposta ou consultando. */
function SaudeServicos() {
  return (
    <ul className="servicos" aria-label="Situação dos serviços">
      <li className="servicos__titulo"><Activity size={15} aria-hidden="true" /> Serviços</li>
      {SERVICOS.map((s) => <Servico key={s.nome} {...s} />)}
    </ul>
  );
}

function Servico({ nome, rotulo }: { nome: NomeServico; rotulo: string }) {
  const leitura = useLeitura(['saude', nome], (sinal) => saude(nome, sinal), { intervaloMs: 10_000, limiteMs: 35_000 });
  const estado = leitura.isError ? 'fora' : leitura.data?.status === 'ok' ? 'ok' : 'consultando';
  const texto = estado === 'ok' ? 'respondendo' : estado === 'fora' ? 'sem resposta' : 'consultando';
  return (
    <li className={`servicos__item servicos__item--${estado}`} title={`${rotulo}: ${texto}`}>
      <span className="servicos__ponto" aria-hidden="true" />
      <span className="servicos__nome">{rotulo}</span><span className="sr">: {texto}</span>
    </li>
  );
}
