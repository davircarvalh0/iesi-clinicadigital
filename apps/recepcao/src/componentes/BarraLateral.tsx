import { Bell, Calendar, Plus, Users } from 'lucide-react';

export function BarraLateral({ consultasHoje }: { consultasHoje: number }) {
  return (
    <aside className="barra-lateral">
      <div className="marca">
        <span className="marca__icone">
          <Plus size={22} strokeWidth={2.75} />
        </span>
        <div>
          <strong className="marca__nome">Vida &amp; Saúde</strong>
          <span className="marca__local">Clínica · Recife/PE</span>
        </div>
      </div>

      <p className="barra-lateral__secao">Recepção</p>
      <nav className="menu">
        <a className="menu__item menu__item--ativo" href="#">
          <Calendar size={19} /> Agenda
          <span className="menu__contador">{consultasHoje}</span>
        </a>
        {/* Próximas etapas: cadastro único de pacientes e tela de lembretes. */}
        <a className="menu__item" href="#" onClick={(e) => e.preventDefault()}>
          <Users size={19} /> Pacientes
        </a>
        <a className="menu__item" href="#" onClick={(e) => e.preventDefault()}>
          <Bell size={19} /> Lembretes
        </a>
      </nav>
    </aside>
  );
}
