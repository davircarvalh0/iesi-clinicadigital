import { Bell, Calendar, Plus, Users } from 'lucide-react';
import type { Tela } from '../navegacao';

const ITENS: { tela: Tela; texto: string; Icone: typeof Calendar }[] = [
  { tela: 'agenda', texto: 'Agenda', Icone: Calendar },
  { tela: 'pacientes', texto: 'Pacientes', Icone: Users },
  { tela: 'lembretes', texto: 'Lembretes', Icone: Bell },
];

export function BarraLateral({ consultasHoje, tela }: { consultasHoje: number; tela: Tela }) {
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
        {ITENS.map(({ tela: destino, texto, Icone }) => (
          <a key={destino} className={`menu__item ${tela === destino ? 'menu__item--ativo' : ''}`} href={`#${destino}`}
            aria-current={tela === destino ? 'page' : undefined}>
            <Icone size={19} /> {texto}
            {destino === 'agenda' && <span className="menu__contador">{consultasHoje}</span>}
          </a>
        ))}
      </nav>
    </aside>
  );
}
