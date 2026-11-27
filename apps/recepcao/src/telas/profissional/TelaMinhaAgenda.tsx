import { Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLeitura } from '../../app/leitura';
import { useUsuario } from '../../app/sessao';
import { agendamento } from '../../api/servicos';
import type { Consulta } from '../../api/tipos';
import { chaveDia, dataHora, diaPorExtenso, hoje, hora, nomeDoDia, saudacao } from '../../dominio/datas';
import { Atualizacao, Aviso, CabecalhoTela, Carregando, Confirmacao, Selo, Vazio } from '../../ui/componentes';
import { useMudancasSituacao, type EstadoSituacao, type NovaSituacao } from '../agenda/situacao';

/** Ainda vai acontecer: não cancelada, não já encerrada (concluida/falta). */
const ativa = (c: Consulta) => c.status === 'agendada' || c.status === 'confirmada';

/** Agenda do profissional: só as consultas dele (o Agendamento filtra pelo perfil). Registra presença/falta. */
export function TelaMinhaAgenda() {
  const usuario = useUsuario();
  const cliente = useQueryClient();
  const consultas = useLeitura(['minhas-consultas'], agendamento.consultas, { intervaloMs: 15_000 });
  const situacoes = useMudancasSituacao(consultas.data, consultas.dataUpdatedAt);
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const atualizar = () => cliente.invalidateQueries({ queryKey: ['minhas-consultas'] });

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
            {hojeLista.filter(ativa).length
              ? `Hoje você tem ${hojeLista.filter(ativa).length} consulta(s).`
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
                  <ConsultaProfissional key={c.id} consulta={c} situacao={situacoes.estado(c)} aoMudarSituacao={(nova) => situacoes.mudar(c, nova, atualizar)} />
                ))}
              </ol>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function ConsultaProfissional({ consulta: c, situacao, aoMudarSituacao }: {
  consulta: Consulta;
  situacao?: EstadoSituacao;
  aoMudarSituacao: (nova: NovaSituacao) => void;
}) {
  const [confirmando, setConfirmando] = useState<'concluida' | 'falta' | null>(null);
  const jaComecou = new Date(c.inicio) <= new Date();
  const travado = situacao?.fase === 'enviando' || situacao?.fase === 'incerto';

  return (
    <li className={`horario ${c.status === 'cancelada' ? 'horario--cancelado' : ''}`} aria-busy={situacao?.fase === 'enviando'}>
      <time className="horario__hora" dateTime={c.inicio}>{hora(c.inicio)}</time>
      <article className="consulta">
        <div className="consulta__principal">
          <h3 className="consulta__paciente">{c.pacienteNome}</h3>
          <p className="consulta__detalhes">{c.especialidade}</p>
          <div className="consulta__selos">
            {c.status === 'cancelada' && <Selo tom="perigo">Cancelada</Selo>}
            {c.status === 'confirmada' && <Selo tom="info">Confirmada</Selo>}
            {c.status === 'concluida' && <Selo tom="ok">Concluída</Selo>}
            {c.status === 'falta' && <Selo tom="perigo">Faltou</Selo>}
          </div>
          {situacao && !travado && situacao.fase === 'recusado' && <p className="consulta__resultado consulta__resultado--erro" role="alert">{situacao.mensagem}</p>}
          {situacao?.fase === 'incerto' && (
            <p className="consulta__resultado consulta__resultado--alerta" role="alert">
              O Agendamento não respondeu. Ainda não dá para saber se a situação mudou. A tela confere sozinha na próxima atualização; não repita o pedido.
            </p>
          )}
        </div>
        {ativa(c) && jaComecou && (
          <div className="consulta__acoes">
            <button type="button" className="botao botao--quieto" onClick={() => setConfirmando('concluida')} disabled={travado}>
              <Check size={16} aria-hidden="true" /> Concluída
            </button>
            <button type="button" className="botao botao--quieto botao--texto-perigo" onClick={() => setConfirmando('falta')} disabled={travado}>
              <X size={16} aria-hidden="true" /> Faltou
            </button>
          </div>
        )}
      </article>

      {confirmando === 'concluida' && (
        <Confirmacao
          titulo="Marcar consulta como concluída?"
          confirmar="Marcar como concluída"
          aoFechar={() => setConfirmando(null)}
          aoConfirmar={() => { setConfirmando(null); aoMudarSituacao('concluida'); }}
        >
          <p><strong>{c.pacienteNome}</strong>, {dataHora(c.inicio)}.</p>
          <p>Depois de concluída, a consulta não pode mais ser remarcada ou cancelada pela tela.</p>
        </Confirmacao>
      )}
      {confirmando === 'falta' && (
        <Confirmacao
          titulo="Registrar falta do paciente?"
          confirmar="Registrar falta"
          perigo
          aoFechar={() => setConfirmando(null)}
          aoConfirmar={() => { setConfirmando(null); aoMudarSituacao('falta'); }}
        >
          <p><strong>{c.pacienteNome}</strong>, {dataHora(c.inicio)}.</p>
          <p>Depois de registrada, a falta não pode mais ser desfeita pela tela.</p>
        </Confirmacao>
      )}
    </li>
  );
}
