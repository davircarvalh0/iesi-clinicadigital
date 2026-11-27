import { useMemo, useState } from 'react';
import { useLeitura } from '../../app/leitura';
import { useUsuario } from '../../app/sessao';
import { agendamento } from '../../api/servicos';
import type { Consulta } from '../../api/tipos';
import { chaveDia, diaPorExtenso, hoje, hora, nomeDoDia, saudacao } from '../../dominio/datas';
import { Atualizacao, Aviso, CabecalhoTela, Carregando, Selo, Vazio } from '../../ui/componentes';

/** Agenda do profissional: só leitura, só as consultas dele (o Agendamento filtra pelo perfil). */
export function TelaMinhaAgenda() {
  const usuario = useUsuario();
  const consultas = useLeitura(['minhas-consultas'], agendamento.consultas, { intervaloMs: 15_000 });
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);

  const dias = useMemo(() => {
    const mapa = new Map<string, Consulta[]>();
    for (const c of consultas.data ?? []) {
      if (chaveDia(c.inicio) < hoje()) continue;
      if (c.status === 'cancelada' && !mostrarCanceladas) continue;
      const chave = chaveDia(c.inicio);
      mapa.set(chave, [...(mapa.get(chave) ?? []), c]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, lista]) => [dia, lista.sort((a, b) => a.inicio.localeCompare(b.inicio))] as const);
  }, [consultas.data, mostrarCanceladas]);

  const hojeLista = dias.find(([d]) => d === hoje())?.[1] ?? [];

  return (
    <div className="tela">
      <CabecalhoTela titulo="Minha agenda" descricao={`${saudacao()}, ${usuario.nome}. ${diaPorExtenso()}.`}>
        <Atualizacao servico="Agendamento" frescor={consultas.frescor} atualizadoEm={consultas.atualizadoEm} />
      </CabecalhoTela>

      {consultas.frescor === 'desatualizado' && <Aviso tom="alerta">O Agendamento não está respondendo. A agenda pode não mostrar as alterações mais recentes.</Aviso>}
      {consultas.frescor === 'carregando' && <Carregando texto="Carregando sua agenda…" />}
      {consultas.frescor === 'indisponivel' && <Vazio titulo="Não foi possível carregar sua agenda">O Agendamento não respondeu. A tela tenta de novo sozinha.</Vazio>}

      {consultas.data && (
        <>
          <p className="resumo-lista">
            {hojeLista.filter((c) => c.status === 'agendada').length
              ? `Hoje você tem ${hojeLista.filter((c) => c.status === 'agendada').length} consulta(s).`
              : 'Nenhuma consulta hoje.'}
            {' '}
            <label className="alternador"><input type="checkbox" checked={mostrarCanceladas} onChange={(e) => setMostrarCanceladas(e.target.checked)} /> Mostrar canceladas</label>
          </p>
          {dias.length === 0 && <Vazio titulo="Nenhuma consulta marcada">Quando a recepção agendar uma consulta com você, ela aparece aqui.</Vazio>}
          {dias.map(([dia, lista]) => (
            <section key={dia} className="dia-profissional" aria-label={nomeDoDia(dia)}>
              <h2 className="dia-profissional__titulo">{nomeDoDia(dia)}</h2>
              <ol className="horarios horarios--simples">
                {lista.map((c) => (
                  <li key={c.id} className={`horario ${c.status === 'cancelada' ? 'horario--cancelado' : ''}`}>
                    <time className="horario__hora" dateTime={c.inicio}>{hora(c.inicio)}</time>
                    <article className="consulta">
                      <div className="consulta__principal">
                        <h3 className="consulta__paciente">{c.pacienteNome}</h3>
                        <p className="consulta__detalhes">{c.especialidade}</p>
                        {c.status === 'cancelada' && <div className="consulta__selos"><Selo tom="perigo">Cancelada</Selo></div>}
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
