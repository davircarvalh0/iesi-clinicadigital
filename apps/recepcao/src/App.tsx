import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { agendamentoApi } from './api/agendamento';
import { notificacaoApi } from './api/notificacao';
import { Indicadores } from './agenda/Indicadores';
import { ListaConsultas } from './agenda/ListaConsultas';
import { ModalConsulta, type ModoModal } from './agenda/ModalConsulta';
import { BarraLateral } from './componentes/BarraLateral';
import { ModoDemonstracao } from './eventos/ModoDemonstracao';
import { PainelEventos } from './eventos/PainelEventos';
import { chaveDia, diaPorExtenso, saudacao } from './formatacao';
import { usePolling } from './hooks/usePolling';
import type { Consulta, Lembrete } from './tipos';

const INTERVALO_POLLING_MS = 1500;
const RECEPCIONISTA = 'Juliana';

export function App() {
  const consultas = usePolling(agendamentoApi.listar, INTERVALO_POLLING_MS);
  const lembretes = usePolling(() => notificacaoApi.listar(), INTERVALO_POLLING_MS);
  const eventos = usePolling(agendamentoApi.listarEventos, INTERVALO_POLLING_MS);
  const atividades = usePolling(notificacaoApi.listarAtividades, INTERVALO_POLLING_MS);
  const consumo = usePolling(notificacaoApi.estadoConsumo, INTERVALO_POLLING_MS);
  const [modal, setModal] = useState<ModoModal | null>(null);

  const listaConsultas = consultas.dados ?? [];
  const lembretePorConsulta = useMemo(() => {
    const mapa = new Map<string, Lembrete>();
    for (const l of lembretes.dados ?? []) mapa.set(l.idConsulta, l);
    return mapa;
  }, [lembretes.dados]);

  const consultasHoje = listaConsultas.filter(
    (c) => c.status === 'agendada' && chaveDia(new Date(c.inicio)) === chaveDia(new Date()),
  ).length;

  const atualizar = () =>
    Promise.all([consultas.recarregar(), lembretes.recarregar(), eventos.recarregar(), atividades.recarregar(), consumo.recarregar()]);

  const cancelar = async (consulta: Consulta) => {
    await agendamentoApi.cancelar(consulta.id);
    await atualizar();
  };

  return (
    <div className="layout">
      <BarraLateral consultasHoje={consultasHoje} />

      <main className="principal">
        <header className="cabecalho">
          <div>
            <p className="cabecalho__saudacao">
              {saudacao()}, {RECEPCIONISTA} · {diaPorExtenso(new Date())}
            </p>
            <h1 className="cabecalho__titulo">Agenda</h1>
          </div>
          <button className="botao botao--primario botao--destaque" onClick={() => setModal({ tipo: 'nova' })}>
            <Plus size={18} strokeWidth={2.5} /> Nova consulta
          </button>
        </header>

        {consultas.erro && <p className="aviso aviso--erro">Agendamento indisponível: {consultas.erro.message}</p>}

        <Indicadores consultas={listaConsultas} lembretes={lembretes.dados ?? []} />
        <ListaConsultas
          consultas={listaConsultas}
          lembretePorConsulta={lembretePorConsulta}
          aoRemarcar={(consulta) => setModal({ tipo: 'remarcar', consulta })}
          aoCancelar={cancelar}
        />
      </main>

      <div className="coluna-direita">
        <PainelEventos
          eventos={eventos.dados ?? []}
          atividades={atividades.dados ?? []}
          notificacaoNoAr={!atividades.erro && consumo.dados?.consumindo !== false}
          notificacaoAcessivel={!atividades.erro}
        />
        <ModoDemonstracao consumo={consumo.dados} acessivel={!consumo.erro} eventos={eventos.dados ?? []} aoMudar={atualizar} />
      </div>

      {modal && (
        <ModalConsulta modo={modal} consultas={listaConsultas} aoFechar={() => setModal(null)} aoSalvar={atualizar} />
      )}
    </div>
  );
}
