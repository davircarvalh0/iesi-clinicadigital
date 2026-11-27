import { keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';
import { useLeitura } from '../../app/leitura';
import { notificacao, type FiltroPainel } from '../../api/servicos';
import type { ConfiguracaoEnvio, LembreteNoPainel, StatusLembrete } from '../../api/tipos';
import { dataHora, hoje, hora, nomeDoDia, chaveDia, somarDias } from '../../dominio/datas';
import { velho } from '../../dominio/frescor';
import { descreverEnvio, ORDEM_FILTROS, SITUACAO } from '../../dominio/lembretes';
import { Atualizacao, Aviso, CabecalhoTela, Carregando, Selo, Vazio } from '../../ui/componentes';
import { GavetaTrilha } from './GavetaTrilha';
import { useQuery } from '@tanstack/react-query';

type Periodo = 'hoje' | 'proximos' | 'anteriores' | 'todos';
const PERIODOS: Record<Periodo, string> = { hoje: 'Hoje', proximos: 'Próximos 7 dias', anteriores: 'Últimos 7 dias', todos: 'Todos' };
const TAMANHO = 20;

export function intervalo(periodo: Periodo, dia = hoje()): { de?: string; ate?: string } {
  if (periodo === 'hoje') return { de: dia, ate: dia };
  if (periodo === 'proximos') return { de: dia, ate: somarDias(dia, 6) };
  if (periodo === 'anteriores') return { de: somarDias(dia, -6), ate: dia };
  return {};
}

export function TelaLembretes() {
  const [periodo, setPeriodo] = useState<Periodo>('proximos');
  const [situacoes, setSituacoes] = useState<StatusLembrete[]>([]);
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<LembreteNoPainel | null>(null);

  const filtro: FiltroPainel = { situacoes, ...intervalo(periodo), pagina, tamanhoPagina: TAMANHO };
  const painel = useLeitura(['painel-lembretes', filtro], (s) => notificacao.painel(filtro, s), { intervaloMs: 4000 });
  const configuracao = useQuery({ queryKey: ['configuracao-envio'], queryFn: ({ signal }) => notificacao.configuracaoEnvio(signal), refetchInterval: 30_000, placeholderData: keepPreviousData });
  const dados = painel.data;
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / TAMANHO)) : 1;

  const alternar = (s: StatusLembrete) => {
    setSituacoes((atual) => (atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s]));
    setPagina(1);
  };

  return (
    <div className="tela">
      <CabecalhoTela titulo="Lembretes" descricao="Cada consulta agendada gera um lembrete. Aqui fica o que foi enviado, o que falhou e o que precisa de decisão." />

      <ModoEnvio configuracao={configuracao.data} falhou={configuracao.isError} />

      <div className="filtros">
        <div className="segmentado" role="group" aria-label="Período da consulta">
          {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
            <button key={p} type="button" aria-pressed={periodo === p} className={`segmentado__item ${periodo === p ? 'segmentado__item--ativo' : ''}`}
              onClick={() => { setPeriodo(p); setPagina(1); }}>{PERIODOS[p]}</button>
          ))}
        </div>
        <div className="fichas" role="group" aria-label="Situação do lembrete">
          {ORDEM_FILTROS.map((s) => {
            const qtd = dados?.contagem[s] ?? 0;
            const ativo = situacoes.includes(s);
            if (!ativo && qtd === 0 && (s === 'enviado' || s === 'enviando')) return null;
            return (
              <button key={s} type="button" aria-pressed={ativo} className={`ficha-filtro ficha-filtro--${SITUACAO[s].tom} ${ativo ? 'ficha-filtro--ativa' : ''}`} onClick={() => alternar(s)}>
                {SITUACAO[s].filtro}<span className="ficha-filtro__qtd">{dados ? qtd : '…'}</span>
              </button>
            );
          })}
          {situacoes.length > 0 && <button type="button" className="botao botao--quieto" onClick={() => { setSituacoes([]); setPagina(1); }}>Limpar</button>}
        </div>
      </div>

      <div className="faixa-estado">
        {dados && <span>{dados.total} lembrete{dados.total === 1 ? '' : 's'}</span>}
        <Atualizacao servico="Notificação" frescor={painel.frescor} atualizadoEm={painel.atualizadoEm} />
      </div>

      {velho(painel.frescor) && <Aviso tom="alerta">A lista é da última leitura que deu certo e pode não mostrar envios recentes.</Aviso>}
      {painel.frescor === 'carregando' && <Carregando texto="Carregando lembretes…" />}
      {painel.frescor === 'indisponivel' && (
        <Vazio titulo="A Notificação não respondeu" acao={<button type="button" className="botao botao--secundario" onClick={() => void painel.refetch()}>Tentar de novo</button>}>
          A situação dos lembretes é desconhecida. Isso não significa que não há lembretes.
        </Vazio>
      )}
      {dados && dados.itens.length === 0 && (
        <Vazio titulo="Nenhum lembrete neste filtro">
          {situacoes.length ? 'Tente outras situações ou outro período.' : 'Os lembretes aparecem aqui quando as consultas do período são agendadas.'}
        </Vazio>
      )}

      {dados && dados.itens.length > 0 && (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr><th scope="col">Consulta</th><th scope="col">Paciente</th><th scope="col">Situação</th><th scope="col">Envio</th><th scope="col"><span className="sr">Ações</span></th></tr>
            </thead>
            <tbody>
              {dados.itens.map((l) => (
                <tr key={l.id} className={l.status === 'incerto' && !l.incertoResolvidoEm ? 'tabela__linha--atencao' : ''}>
                  <td className="tabela__quando"><strong>{hora(l.inicioConsulta)}</strong><span>{nomeDoDia(chaveDia(l.inicioConsulta))}</span></td>
                  <td><span className="tabela__principal">{l.pacienteNome}</span><span className="tabela__secundario">{l.profissional}, {l.especialidade.toLowerCase()}</span></td>
                  <td>
                    <Selo tom={SITUACAO[l.status].tom} titulo={SITUACAO[l.status].descricao}>{SITUACAO[l.status].nome}</Selo>
                    {l.motivoFalha && <span className="tabela__motivo">{l.motivoFalha}</span>}
                  </td>
                  <td className="tabela__envio"><DescricaoEnvio l={l} /></td>
                  <td className="tabela__acao">
                    <button type="button" className={`botao ${l.status === 'incerto' && !l.incertoResolvidoEm ? 'botao--primario' : 'botao--quieto'}`} onClick={() => setAberto(l)}>
                      {l.status === 'incerto' && !l.incertoResolvidoEm ? 'Decidir' : 'Ver trilha'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paginas > 1 && (
        <nav className="paginacao" aria-label="Páginas">
          <button type="button" className="botao botao--quieto" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          <span>Página {pagina} de {paginas}</span>
          <button type="button" className="botao botao--quieto" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Próxima</button>
        </nav>
      )}

      {aberto && <GavetaTrilha lembrete={aberto} aoFechar={() => setAberto(null)} />}
    </div>
  );
}

function DescricaoEnvio({ l }: { l: LembreteNoPainel }) {
  const modo = descreverEnvio(l.modoEnvio, l.canalEnvio);
  if (l.status === 'programado' || l.status === 'bloqueado') return <span>Previsto para {dataHora(l.enviarEm)}</span>;
  if (l.status === 'cancelado') return <span className="nota">Não será enviado</span>;
  return (
    <span>
      {l.enviadoEm ? `Concluído ${dataHora(l.enviadoEm)}` : `Previsto para ${dataHora(l.enviarEm)}`}
      {(modo || l.tentativas > 0) && <span className="tabela__secundario">{[modo, l.tentativas ? `${l.tentativas} tentativa${l.tentativas > 1 ? 's' : ''}` : null].filter(Boolean).join(', ')}</span>}
    </span>
  );
}

/** O modo de envio fica sempre explícito: a tela nunca apresenta uma simulação como envio real (US-12, US-15). */
function ModoEnvio({ configuracao: c, falhou }: { configuracao?: ConfiguracaoEnvio; falhou: boolean }) {
  if (!c) {
    return <div className="modo-envio modo-envio--desconhecido"><p className="modo-envio__titulo">{falhou ? 'Modo de envio desconhecido' : 'Consultando o modo de envio…'}</p>
      {falhou && <p className="modo-envio__texto">A Notificação não respondeu. Não é possível dizer se os lembretes saem de verdade.</p>}</div>;
  }
  const real = c.modo === 'real';
  const destinos = c.destinosPermitidos === 'todos' ? 'qualquer número' : c.destinosPermitidos ? `${c.destinosPermitidos} número${c.destinosPermitidos > 1 ? 's' : ''} de teste` : 'nenhum número';
  return (
    <div className={`modo-envio ${real ? 'modo-envio--real' : 'modo-envio--simulado'}`}>
      <div>
        <p className="modo-envio__titulo">{real ? 'Envio real pelo WhatsApp' : 'Envio simulado'}</p>
        <p className="modo-envio__texto">
          {real ? `As mensagens saem de verdade, só para ${destinos}.` : 'Nenhuma mensagem sai da clínica: os envios ficam registrados só no log.'}
          {' '}{c.motivo}
        </p>
      </div>
      <dl className="modo-envio__regras">
        <div><dt>Antecedência</dt><dd>{c.antecedenciaMinutos >= 60 ? `${Math.round(c.antecedenciaMinutos / 60)} h` : `${c.antecedenciaMinutos} min`}{c.modoAntecedencia === 'demonstracao' && ' (demonstração)'}</dd></div>
        <div><dt>Tentativas</dt><dd>até {c.maxTentativas}</dd></div>
      </dl>
    </div>
  );
}
