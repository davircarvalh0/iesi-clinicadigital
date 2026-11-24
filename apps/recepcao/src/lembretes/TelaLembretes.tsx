// US-09: listagem dedicada de lembretes, com filtro por situação e período.
import { Bell, BellOff, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { notificacaoApi } from '../api/notificacao';
import { Selo } from '../componentes/Selo';
import { dataHora, horaComSegundos, rotuloDia, hora } from '../formatacao';
import { useAgora } from '../hooks/useAgora';
import { usePolling } from '../hooks/usePolling';
import { situacaoDe, type Leitura } from '../sincronizacao';
import type { ItemPainelLembrete, PaginaLembretes } from '../tipos';
import {
  alternarSituacao, consultaDoFiltro, NOME_PERIODO, totalDePaginas,
  type FiltroLembretes, type Periodo,
} from './filtros';
import { descreverModo, NOME_SITUACAO, ORDEM_SITUACOES, SELO_LEMBRETE } from './rotulos';

const INTERVALO_MS = 5000;
const LIMITE_ATRASO_MS = 15_000;

/** Resposta marcada com a consulta que a originou: uma resposta atrasada de outro filtro é descartada. */
interface Resposta { consulta: string; pagina: PaginaLembretes }

export function TelaLembretes() {
  const [filtro, setFiltro] = useState<FiltroLembretes>({ periodo: 'proximos7', situacoes: [], pagina: 1 });
  const consulta = consultaDoFiltro(filtro);
  const leitura = usePolling<Resposta>(
    () => notificacaoApi.painel(consulta).then((pagina) => ({ consulta, pagina })),
    INTERVALO_MS,
  );
  const { recarregar } = leitura;
  useEffect(() => { void recarregar(); }, [consulta, recarregar]);
  const agora = useAgora();

  return (
    <PainelLembretes
      filtro={filtro}
      leitura={leitura}
      consulta={consulta}
      agora={agora}
      aoMudarFiltro={setFiltro}
      aoAtualizar={() => void recarregar()}
    />
  );
}

interface PropsPainel {
  filtro: FiltroLembretes;
  leitura: Leitura<Resposta>;
  consulta: string;
  agora: number;
  aoMudarFiltro: (filtro: FiltroLembretes) => void;
  aoAtualizar: () => void;
}

/** Parte visual, sem efeitos: renderizada nos testes com estados controlados. */
export function PainelLembretes({ filtro, leitura, consulta, agora, aoMudarFiltro, aoAtualizar }: PropsPainel) {
  const situacao = situacaoDe(leitura, agora, LIMITE_ATRASO_MS);
  // Só exibe dados do filtro atual; dados de outro filtro contam como "carregando".
  const dados = leitura.dados?.consulta === consulta ? leitura.dados.pagina : undefined;
  const paginas = totalDePaginas(dados?.total ?? 0, dados?.tamanhoPagina);

  return (
    <section className="cartao lista lembretes" aria-labelledby="titulo-lembretes">
      <div className="lista__cabecalho">
        <h2 id="titulo-lembretes" className="lista__titulo"><Bell size={19} aria-hidden="true" /> Lembretes</h2>
        <button type="button" className="acao" onClick={aoAtualizar}><RefreshCw size={15} aria-hidden="true" /> Atualizar</button>
      </div>

      <div className="lembretes__filtros">
        <div className="lembretes__grupo" role="group" aria-label="Período da consulta">
          {(Object.keys(NOME_PERIODO) as Periodo[]).map((periodo) => (
            <button key={periodo} type="button" aria-pressed={filtro.periodo === periodo}
              className={`chip ${filtro.periodo === periodo ? 'chip--marca' : 'chip--apagado'}`}
              onClick={() => aoMudarFiltro({ ...filtro, periodo, pagina: 1 })}>
              {NOME_PERIODO[periodo]}
            </button>
          ))}
        </div>
        <div className="lembretes__grupo" role="group" aria-label="Situação do lembrete">
          {ORDEM_SITUACOES.map((s) => {
            const ativo = filtro.situacoes.includes(s);
            return (
              <button key={s} type="button" aria-pressed={ativo}
                className={`chip ${ativo ? 'chip--marca' : 'chip--apagado'}`}
                onClick={() => aoMudarFiltro(alternarSituacao(filtro, s))}>
                {NOME_SITUACAO[s]}{dados ? ` · ${dados.contagem[s] ?? 0}` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {!dados && leitura.erro && (
        <div className="pacientes__estado" role="alert">
          <p className="aviso aviso--erro">Notificação indisponível: a situação dos lembretes é desconhecida.</p>
          <button className="botao botao--secundario" onClick={aoAtualizar}>Tentar novamente</button>
        </div>
      )}
      {!dados && !leitura.erro && <p className="lista__vazia" role="status">Carregando lembretes…</p>}

      {dados && <>
        <p className="pacientes__resumo" role="status">
          {dados.total} lembrete(s){filtro.situacoes.length ? ' com as situações escolhidas' : ''} · {NOME_PERIODO[filtro.periodo].toLowerCase()}
          {leitura.atualizadoEm !== null && ` · atualizado às ${horaComSegundos(leitura.atualizadoEm)}`}
        </p>
        {(situacao === 'desatualizado' || situacao === 'atrasado') && leitura.atualizadoEm !== null && (
          <p className="aviso lembretes__aviso" role="alert">
            {situacao === 'desatualizado' ? 'Notificação indisponível' : 'Atualização atrasada'}: a lista é de{' '}
            {horaComSegundos(leitura.atualizadoEm)} e pode não mostrar envios recentes.
          </p>
        )}
        {dados.itens.length === 0
          ? <p className="lista__vazia">{filtro.situacoes.length || filtro.periodo !== 'todos'
            ? 'Nenhum lembrete com estes filtros.' : 'Nenhum lembrete registrado. Os agendamentos geram lembretes automaticamente.'}</p>
          : <ul className="lembretes__lista">{dados.itens.map((l) => <ItemLembrete key={l.id} lembrete={l} />)}</ul>}
        {paginas > 1 && (
          <nav className="pacientes__paginacao" aria-label="Paginação de lembretes">
            <button className="botao botao--secundario" disabled={filtro.pagina <= 1}
              onClick={() => aoMudarFiltro({ ...filtro, pagina: filtro.pagina - 1 })}>Anterior</button>
            <span>Página {filtro.pagina} de {paginas}</span>
            <button className="botao botao--secundario" disabled={filtro.pagina >= paginas}
              onClick={() => aoMudarFiltro({ ...filtro, pagina: filtro.pagina + 1 })}>Próxima</button>
          </nav>
        )}
      </>}
    </section>
  );
}

function ItemLembrete({ lembrete: l }: { lembrete: ItemPainelLembrete }) {
  const selo = SELO_LEMBRETE[l.status];
  const concluido = l.enviadoEm !== null;
  return (
    <li className="lembrete">
      <div className="lembrete__quando">
        <time dateTime={l.inicioConsulta}>{hora(l.inicioConsulta)}</time>
        <span>{rotuloDia(l.inicioConsulta).split(' · ')[0]}</span>
      </div>
      <div className="paciente__dados">
        <h3>{l.pacienteNome}</h3>
        <span>{l.profissional} · {l.especialidade}</span>
        <span>
          {concluido ? `Concluído em ${dataHora(l.enviadoEm!)}` : `Previsto para ${dataHora(l.enviarEm)}`}
          {' · '}{descreverModo(l)}
          {l.tentativas > 0 && ` · ${l.tentativas} tentativa(s)`}
        </span>
        {l.motivoFalha && <span className="lembrete__motivo">{l.motivoFalha}</span>}
        {l.idExterno && <span>Identificador do provedor: {l.idExterno}</span>}
      </div>
      <div className="lembrete__selos">
        <Selo tom={selo.tom}>
          {l.status === 'cancelado' ? <BellOff size={13} aria-hidden="true" /> : <Bell size={13} aria-hidden="true" />}
          {' '}{selo.texto}
        </Selo>
        {l.antecedenciaMinutos != null && l.antecedenciaMinutos < 1440 && (
          <Selo tom="alerta">Demonstração · {l.antecedenciaMinutos} min</Selo>
        )}
      </div>
    </li>
  );
}
