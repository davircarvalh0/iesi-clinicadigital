import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cadastroApi } from './api/cadastro';
import { TelaPacientes } from './pacientes/TelaPacientes';
import { TelaLembretes } from './lembretes/TelaLembretes';
import { TITULO_TELA, telaDoHash, type Tela } from './navegacao';
import { agendamentoApi } from './api/agendamento';
import { motivoDaFalha } from './api/http';
import { notificacaoApi } from './api/notificacao';
import { cancelarConsulta } from './agenda/cancelamento';
import { Indicadores } from './agenda/Indicadores';
import { ListaConsultas } from './agenda/ListaConsultas';
import { ModalConsulta, type ModoModal } from './agenda/ModalConsulta';
import { BarraLateral } from './componentes/BarraLateral';
import { EstadoSincronizacao } from './componentes/EstadoSincronizacao';
import { ModoDemonstracao } from './eventos/ModoDemonstracao';
import { PainelEventos } from './eventos/PainelEventos';
import { chaveDia, diaPorExtenso, horaComSegundos, saudacao } from './formatacao';
import { useAgora } from './hooks/useAgora';
import { usePolling } from './hooks/usePolling';
import {
  aplicarAcao, conferirCancelamento, pendenciaDoLembrete, situacaoDe, situacaoDesconhecida,
  type AcaoCancelamento,
} from './sincronizacao';
import type { Consulta, Lembrete } from './tipos';

const INTERVALO_POLLING_MS = 1500;
/** Sem resposta boa há mais que isso (4 ciclos), o dado na tela é tratado como atrasado. */
const LIMITE_ATRASO_MS = 6000;
const RECEPCIONISTA = 'Juliana';

export function App() {
  const [tela, setTela] = useState<Tela>(() => telaDoHash(window.location.hash));
  useEffect(() => {
    const navegar = () => setTela(telaDoHash(window.location.hash));
    window.addEventListener('hashchange', navegar);
    return () => window.removeEventListener('hashchange', navegar);
  }, []);
  const cadastro = usePolling(cadastroApi.resumo, INTERVALO_POLLING_MS);
  const consultas = usePolling(agendamentoApi.listar, INTERVALO_POLLING_MS);
  const lembretes = usePolling(() => notificacaoApi.listar(), INTERVALO_POLLING_MS);
  const eventos = usePolling(agendamentoApi.listarEventos, INTERVALO_POLLING_MS);
  const atividades = usePolling(notificacaoApi.listarAtividades, INTERVALO_POLLING_MS);
  const consumo = usePolling(notificacaoApi.estadoConsumo, INTERVALO_POLLING_MS);
  const [modal, setModal] = useState<ModoModal | null>(null);
  const [acoes, setAcoes] = useState<ReadonlyMap<string, AcaoCancelamento>>(new Map());
  const cancelando = useRef(new Set<string>());
  const agora = useAgora();

  const situacaoConsultas = situacaoDe(consultas, agora, LIMITE_ATRASO_MS);
  const situacaoLembretes = situacaoDe(lembretes, agora, LIMITE_ATRASO_MS);
  const situacaoCadastro = situacaoDe(cadastro, agora, LIMITE_ATRASO_MS);

  const lembretePorConsulta = useMemo(() => {
    const mapa = new Map<string, Lembrete>();
    for (const l of lembretes.dados ?? []) mapa.set(l.idConsulta, l);
    return mapa;
  }, [lembretes.dados]);

  // Cancelamentos incertos são conferidos com a agenda lida depois da falha; confirmados valem já.
  const acaoPorConsulta = new Map<string, AcaoCancelamento>();
  const listaConsultas = (consultas.dados ?? []).map((c) => {
    const acao = acoes.get(c.id);
    if (!acao) return c;
    const conferida = conferirCancelamento(acao, c, consultas.atualizadoEm);
    acaoPorConsulta.set(c.id, conferida);
    return aplicarAcao(c, conferida);
  });

  const pendentes = situacaoDesconhecida(situacaoLembretes)
    ? 0
    : listaConsultas.filter((c) => pendenciaDoLembrete(c, lembretePorConsulta.get(c.id))).length;

  const consultasHoje = listaConsultas.filter(
    (c) => c.status === 'agendada' && chaveDia(new Date(c.inicio)) === chaveDia(new Date()),
  ).length;

  const atualizar = () =>
    Promise.all([consultas.recarregar(), lembretes.recarregar(), eventos.recarregar(), atividades.recarregar(), consumo.recarregar()]);

  const definirAcao = (id: string, acao: AcaoCancelamento) => setAcoes((atual) => new Map(atual).set(id, acao));

  const cancelar = async (consulta: Consulta) => {
    if (cancelando.current.has(consulta.id)) return;
    cancelando.current.add(consulta.id);
    definirAcao(consulta.id, { fase: 'enviando' });
    definirAcao(consulta.id, await cancelarConsulta(agendamentoApi.cancelar, consulta.id));
    cancelando.current.delete(consulta.id);
    await atualizar();
  };

  return (
    <div className="layout">
      <BarraLateral consultasHoje={consultasHoje} tela={tela} />

      <main className="principal">
        <header className="cabecalho">
          <div>
            <p className="cabecalho__saudacao">
              {saudacao()}, {RECEPCIONISTA} · {diaPorExtenso(new Date())}
            </p>
            <h1 className="cabecalho__titulo">{TITULO_TELA[tela]}</h1>
          </div>
          {tela === 'agenda' && <button className="botao botao--primario botao--destaque" onClick={() => setModal({ tipo: 'nova' })}>
            <Plus size={18} strokeWidth={2.5} /> Nova consulta
          </button>}
        </header>

        <EstadoSincronizacao
          pendentes={tela === 'agenda' ? pendentes : 0}
          recursos={[
            { nome: 'Agendamento', situacao: situacaoConsultas, atualizadoEm: consultas.atualizadoEm },
            { nome: 'Notificação', situacao: situacaoLembretes, atualizadoEm: lembretes.atualizadoEm },
            { nome: 'Cadastro', situacao: situacaoCadastro, atualizadoEm: cadastro.atualizadoEm },
          ]}
        />

        {tela === 'agenda' && consultas.erro && (
          <p className="aviso aviso--erro" role="alert">
            Agendamento indisponível ({motivoDaFalha(consultas.erro)}).{' '}
            {consultas.atualizadoEm === null
              ? 'A agenda não pôde ser carregada.'
              : `A agenda abaixo é a de ${horaComSegundos(consultas.atualizadoEm)} e pode não mostrar alterações recentes.`}
          </p>
        )}
        {tela === 'agenda' && lembretes.erro && (
          <p className="aviso" role="alert">
            Notificação indisponível: {lembretes.atualizadoEm === null
              ? 'a situação dos lembretes é desconhecida.'
              : `os lembretes mostrados são de ${horaComSegundos(lembretes.atualizadoEm)} e podem estar desatualizados.`}
          </p>
        )}

        <Indicadores consultas={listaConsultas} lembretes={lembretes.dados ?? []}
          situacaoConsultas={situacaoConsultas} situacaoLembretes={situacaoLembretes}
          totalPacientes={cadastro.dados?.total} cadastroIndisponivel={!!cadastro.erro} />
        {tela === 'pacientes' && <TelaPacientes aoAtualizar={() => { void cadastro.recarregar(); }} />}
        {tela === 'lembretes' && <TelaLembretes />}
        {tela === 'agenda' && <ListaConsultas
          consultas={listaConsultas}
          lembretePorConsulta={lembretePorConsulta}
          situacaoLembretes={situacaoLembretes}
          acaoPorConsulta={acaoPorConsulta}
          aoRemarcar={(consulta) => setModal({ tipo: 'remarcar', consulta })}
          aoCancelar={(consulta) => void cancelar(consulta)}
        />}
      </main>

      <div className="coluna-direita">
        <PainelEventos
          eventos={eventos.dados ?? []}
          atividades={atividades.dados ?? []}
          notificacaoNoAr={!atividades.erro && consumo.dados?.consumindo !== false}
          notificacaoAcessivel={!atividades.erro}
          cadastroEstado={cadastro.erro ? 'indisponível' : cadastro.dados ? 'no ar' : 'conectando'}
        />
        <ModoDemonstracao consumo={consumo.dados} acessivel={!consumo.erro} eventos={eventos.dados ?? []} aoMudar={atualizar} />
      </div>

      {modal && (
        <ModalConsulta modo={modal} aoFechar={() => setModal(null)} aoSalvar={atualizar} />
      )}
    </div>
  );
}
