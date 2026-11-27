import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLeitura } from '../../app/leitura';
import { useUsuario } from '../../app/sessao';
import { agendamento, notificacao } from '../../api/servicos';
import type { Consulta, Lembrete } from '../../api/tipos';
import {
  chaveDia, dataCurta, diaDaSemanaCurto, diaDoMes, diaPorExtenso, hoje, inicioDaSemana, nomeDoDia, saudacao, somarDias,
} from '../../dominio/datas';
import { desconhecido } from '../../dominio/frescor';
import { pendenciaDe } from '../../dominio/lembretes';
import { Atualizacao, Aviso, CabecalhoTela, Carregando, Vazio } from '../../ui/componentes';
import { CartaoConsulta } from './CartaoConsulta';
import { useCancelamentos } from './cancelamentos';
import { DialogoRemarcar } from './DialogoRemarcar';
import { GavetaNovaConsulta } from './GavetaNovaConsulta';

const INTERVALO_MS = 3000;

export function TelaAgenda() {
  const usuario = useUsuario();
  const cliente = useQueryClient();
  const [parametros, setParametros] = useSearchParams();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(parametros.get('dia') ?? '') ? parametros.get('dia')! : hoje();
  const escolherDia = (novo: string) => setParametros(novo === hoje() ? {} : { dia: novo }, { replace: true });

  const consultas = useLeitura(['consultas'], agendamento.consultas, { intervaloMs: INTERVALO_MS });
  const lembretes = useLeitura(['lembretes'], notificacao.lembretes, { intervaloMs: INTERVALO_MS });
  const [nova, setNova] = useState(false);
  const [remarcando, setRemarcando] = useState<Consulta | null>(null);
  const cancelamentos = useCancelamentos(consultas.data, consultas.dataUpdatedAt);

  const atualizarTudo = () => Promise.all([
    cliente.invalidateQueries({ queryKey: ['consultas'] }),
    cliente.invalidateQueries({ queryKey: ['lembretes'] }),
    cliente.invalidateQueries({ queryKey: ['integracao'] }),
  ]);

  const lembretePorConsulta = useMemo(() => {
    const mapa = new Map<string, Lembrete>();
    for (const l of lembretes.data ?? []) mapa.set(l.idConsulta, l);
    return mapa;
  }, [lembretes.data]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, Consulta[]>();
    for (const c of consultas.data ?? []) {
      const chave = chaveDia(c.inicio);
      mapa.set(chave, [...(mapa.get(chave) ?? []), c]);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return mapa;
  }, [consultas.data]);

  const semana = Array.from({ length: 7 }, (_, i) => somarDias(inicioDaSemana(dia), i));
  const doDia = porDia.get(dia) ?? [];
  const agendadas = doDia.filter((c) => c.status !== 'cancelada');
  const lembretesConhecidos = !desconhecido(lembretes.frescor);
  const pendencias = lembretesConhecidos ? doDia.filter((c) => pendenciaDe(c, lembretePorConsulta.get(c.id))).length : 0;

  return (
    <div className="tela tela--agenda">
      <CabecalhoTela
        titulo="Agenda"
        descricao={`${saudacao()}, ${usuario.nome.split(' ')[0]}. ${diaPorExtenso()}.`}
        acoes={<button type="button" className="botao botao--primario" onClick={() => setNova(true)}><Plus size={18} aria-hidden="true" /> Nova consulta</button>}
      />

      <nav className="semana" aria-label="Dias da semana">
        <button type="button" className="botao botao--quieto botao--icone" onClick={() => escolherDia(somarDias(dia, -7))} aria-label="Semana anterior"><ChevronLeft size={20} /></button>
        <ol className="semana__dias">
          {semana.map((chave) => {
            const total = (porDia.get(chave) ?? []).filter((c) => c.status !== 'cancelada').length;
            const passado = chave < hoje();
            return (
              <li key={chave}>
                <button type="button" aria-pressed={chave === dia}
                  className={`dia ${chave === dia ? 'dia--escolhido' : ''} ${chave === hoje() ? 'dia--hoje' : ''} ${passado ? 'dia--passado' : ''}`}
                  onClick={() => escolherDia(chave)}>
                  <span className="dia__semana">{diaDaSemanaCurto(chave)}</span>
                  <span className="dia__numero">{diaDoMes(chave)}</span>
                  <span className="dia__total">{consultas.data ? (total ? <>{total}<span className="dia__palavra"> consulta{total > 1 ? 's' : ''}</span></> : 'livre') : '…'}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="botao botao--quieto botao--icone" onClick={() => escolherDia(somarDias(dia, 7))} aria-label="Próxima semana"><ChevronRight size={20} /></button>
        {dia !== hoje() && <button type="button" className="botao botao--quieto" onClick={() => escolherDia(hoje())}>Hoje</button>}
      </nav>

      <section className="dia-escolhido" aria-labelledby="titulo-dia">
        <header className="dia-escolhido__topo">
          <div>
            <h2 id="titulo-dia" className="dia-escolhido__titulo">{nomeDoDia(dia)}{nomeDoDia(dia).length < 8 && <span className="dia-escolhido__data"> {dataCurta(`${dia}T12:00:00-03:00`)}</span>}</h2>
            {consultas.data && (
              <p className="dia-escolhido__resumo">
                {agendadas.length ? `${agendadas.length} consulta${agendadas.length > 1 ? 's' : ''} agendada${agendadas.length > 1 ? 's' : ''}` : 'Nenhuma consulta agendada'}
                {doDia.length > agendadas.length && `, ${doDia.length - agendadas.length} cancelada${doDia.length - agendadas.length > 1 ? 's' : ''}`}
                {pendencias > 0 && <strong className="dia-escolhido__pendencias">. {pendencias} aguardando a Notificação</strong>}
              </p>
            )}
          </div>
          <div className="dia-escolhido__fontes">
            <Atualizacao servico="Agendamento" frescor={consultas.frescor} atualizadoEm={consultas.atualizadoEm} />
            <Atualizacao servico="Notificação" frescor={lembretes.frescor} atualizadoEm={lembretes.atualizadoEm} />
          </div>
        </header>

        {consultas.frescor === 'desatualizado' && (
          <Aviso tom="perigo">O Agendamento não está respondendo. A agenda abaixo pode não mostrar as alterações mais recentes.</Aviso>
        )}
        {lembretes.frescor === 'indisponivel' && (
          <Aviso tom="alerta">A Notificação não está respondendo. A situação dos lembretes fica desconhecida até ela voltar; a agenda continua funcionando.</Aviso>
        )}
        {lembretes.frescor === 'desatualizado' && (
          <Aviso tom="alerta">A Notificação parou de responder. A situação dos lembretes mostrada é da última leitura e pode estar desatualizada.</Aviso>
        )}

        {consultas.frescor === 'carregando' && <Carregando texto="Carregando a agenda…" />}
        {consultas.frescor === 'indisponivel' && (
          <Vazio titulo="Não foi possível carregar a agenda" acao={<button type="button" className="botao botao--secundario" onClick={() => void consultas.refetch()}>Tentar de novo</button>}>
            O Agendamento não respondeu. A tela tenta de novo sozinha a cada poucos segundos.
          </Vazio>
        )}
        {consultas.data && doDia.length === 0 && (
          <Vazio titulo={dia < hoje() ? 'Nenhuma consulta neste dia' : 'Dia livre'} acao={dia >= hoje() && <button type="button" className="botao botao--secundario" onClick={() => setNova(true)}>Agendar consulta</button>}>
            {dia >= hoje() ? 'Não há consultas marcadas para este dia.' : undefined}
          </Vazio>
        )}

        {doDia.length > 0 && (
          <ol className="horarios">
            {doDia.map((c) => (
              <CartaoConsulta
                key={c.id}
                consulta={c}
                lembrete={lembretePorConsulta.get(c.id)}
                frescorLembretes={lembretes.frescor}
                cancelamento={cancelamentos.estado(c)}
                aoRemarcar={() => setRemarcando(c)}
                aoCancelar={() => cancelamentos.cancelar(c, atualizarTudo)}
              />
            ))}
          </ol>
        )}
      </section>

      {nova && <GavetaNovaConsulta diaSugerido={dia >= hoje() ? dia : hoje()} aoFechar={() => setNova(false)} aoAgendar={(c) => { escolherDia(chaveDia(c.inicio)); return atualizarTudo(); }} aoFalhar={atualizarTudo} />}
      {remarcando && <DialogoRemarcar consulta={remarcando} aoFechar={() => setRemarcando(null)} aoRemarcar={atualizarTudo} />}
    </div>
  );
}
