import { useMemo, useState } from 'react';
import { chaveDia, chaveDiaDaqui, rotuloDia } from '../formatacao';
import type { Consulta, Lembrete } from '../tipos';
import { ItemConsulta } from './ItemConsulta';

type Filtro = 'hoje' | 'semana' | 'todas';
const ROTULOS: Record<Filtro, string> = { hoje: 'Hoje', semana: 'Semana', todas: 'Todas' };

interface Props {
  consultas: Consulta[];
  lembretePorConsulta: Map<string, Lembrete>;
  aoRemarcar: (consulta: Consulta) => void;
  aoCancelar: (consulta: Consulta) => void;
}

export function ListaConsultas({ consultas, lembretePorConsulta, aoRemarcar, aoCancelar }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('semana');

  const porFiltro = useMemo(() => {
    const hoje = chaveDiaDaqui(0);
    const fimSemana = chaveDiaDaqui(6);
    const dia = (c: Consulta) => chaveDia(new Date(c.inicio));
    return {
      hoje: consultas.filter((c) => dia(c) === hoje),
      semana: consultas.filter((c) => dia(c) >= hoje && dia(c) <= fimSemana),
      todas: consultas,
    };
  }, [consultas]);

  const grupos = useMemo(() => agruparPorDia(porFiltro[filtro]), [porFiltro, filtro]);

  return (
    <section className="cartao lista">
      <header className="lista__cabecalho">
        <h2 className="lista__titulo">Consultas</h2>
        <div className="abas">
          {(Object.keys(ROTULOS) as Filtro[]).map((f) => (
            <button key={f} className={`abas__item ${filtro === f ? 'abas__item--ativa' : ''}`} onClick={() => setFiltro(f)}>
              {ROTULOS[f]} · {porFiltro[f].length}
            </button>
          ))}
        </div>
      </header>

      {grupos.length === 0 && <p className="lista__vazia">Nenhuma consulta neste período.</p>}

      {grupos.map(([dia, itens]) => (
        <div key={dia}>
          <h3 className="lista__dia">{rotuloDia(itens[0].inicio)}</h3>
          {itens.map((c) => (
            <ItemConsulta
              key={c.id}
              consulta={c}
              lembrete={lembretePorConsulta.get(c.id)}
              aoRemarcar={() => aoRemarcar(c)}
              aoCancelar={() => aoCancelar(c)}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function agruparPorDia(consultas: Consulta[]): [string, Consulta[]][] {
  const grupos = new Map<string, Consulta[]>();
  for (const c of [...consultas].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const dia = chaveDia(new Date(c.inicio));
    grupos.set(dia, [...(grupos.get(dia) ?? []), c]);
  }
  return [...grupos.entries()];
}
