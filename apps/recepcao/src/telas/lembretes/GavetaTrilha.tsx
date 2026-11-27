import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motivo, statusDe } from '../../api/cliente';
import { notificacao } from '../../api/servicos';
import type { LembreteNoPainel, Trilha } from '../../api/tipos';
import { dataHora, horaSeg } from '../../dominio/datas';
import { nomeAtividade } from '../../dominio/eventos';
import { descreverEnvio, RESULTADO_TENTATIVA, SITUACAO, type Tom } from '../../dominio/lembretes';
import { Aviso, Carregando, Confirmacao, Selo, Sobreposicao } from '../../ui/componentes';

interface Passo { chave: string; em: string; titulo: string; detalhe: string | null; tom: Tom }

/** Tudo o que aconteceu com o lembrete, em ordem: atividades, tentativas de envio e decisões (US-13). */
export function passosDaTrilha(t: Trilha): Passo[] {
  const passos: Passo[] = [
    ...t.atividades.map((a) => ({ chave: `a-${a.id}`, em: a.ocorridoEm, titulo: nomeAtividade(a.acao), detalhe: a.descricao, tom: 'neutro' as Tom })),
    ...t.tentativas.map((x) => ({
      chave: `t-${x.id}`, em: x.iniciadaEm,
      titulo: `Tentativa ${x.numero}: ${RESULTADO_TENTATIVA[x.resultado].nome.toLowerCase()}`,
      detalhe: [x.modo === 'simulado' ? 'simulado (log)' : 'real, pelo WhatsApp', x.motivo, x.idExterno && `id no provedor ${x.idExterno}`].filter(Boolean).join(' · ') || null,
      tom: RESULTADO_TENTATIVA[x.resultado].tom,
    })),
    ...t.resolucoes.map((r) => ({
      chave: `r-${r.id}`, em: r.registradaEm,
      titulo: r.acao === 'reenviar' ? 'Reenvio decidido pela recepção' : 'Mantido sem reenvio pela recepção',
      detalhe: `Decisão de ${r.solicitante}`, tom: 'marca' as Tom,
    })),
  ];
  return passos.sort((a, b) => new Date(a.em).getTime() - new Date(b.em).getTime());
}

export function GavetaTrilha({ lembrete, aoFechar }: { lembrete: LembreteNoPainel; aoFechar: () => void }) {
  const trilha = useQuery({
    queryKey: ['trilha', lembrete.idConsulta],
    queryFn: ({ signal }) => notificacao.trilha(lembrete.idConsulta, signal),
    refetchInterval: 4000,
  });
  const t = trilha.data;
  const status = t?.lembrete.status ?? lembrete.status;
  const decidir = status === 'incerto' && !(t?.lembrete.incertoResolvidoEm ?? lembrete.incertoResolvidoEm);

  return (
    <Sobreposicao lado largura="media" titulo={`Lembrete de ${lembrete.pacienteNome}`} aoFechar={aoFechar}
      subtitulo={<>Consulta {dataHora(lembrete.inicioConsulta)} com {lembrete.profissional}</>}>
      <div className="trilha-resumo">
        <Selo tom={SITUACAO[status].tom}>{SITUACAO[status].nome}</Selo>
        <p className="nota">{SITUACAO[status].descricao}</p>
        <dl className="dados dados--compacto">
          <div><dt>Envio previsto</dt><dd>{dataHora(t?.lembrete.enviarEm ?? lembrete.enviarEm)}</dd></div>
          {(t?.lembrete.enviadoEm ?? lembrete.enviadoEm) && <div><dt>Concluído</dt><dd>{dataHora((t?.lembrete.enviadoEm ?? lembrete.enviadoEm)!)}</dd></div>}
          {descreverEnvio(t?.lembrete.modoEnvio ?? lembrete.modoEnvio, t?.lembrete.canalEnvio ?? lembrete.canalEnvio) && (
            <div><dt>Modo</dt><dd>{descreverEnvio(t?.lembrete.modoEnvio ?? lembrete.modoEnvio, t?.lembrete.canalEnvio ?? lembrete.canalEnvio)}</dd></div>
          )}
        </dl>
      </div>

      {decidir && <DecisaoIncerto idConsulta={lembrete.idConsulta} />}

      <h3 className="trilha-titulo">O que aconteceu</h3>
      {trilha.isPending && <Carregando texto="Carregando a trilha…" />}
      {trilha.isError && !t && <Aviso tom="perigo">Não foi possível carregar a trilha: {motivo(trilha.error)}.</Aviso>}
      {t && (
        <ol className="trilha">
          {passosDaTrilha(t).map((p) => (
            <li key={p.chave} className={`trilha__passo trilha__passo--${p.tom}`}>
              <time className="trilha__quando" dateTime={p.em}>{dataHora(p.em).split(' às ')[0]} <strong>{horaSeg(p.em)}</strong></time>
              <p className="trilha__titulo">{p.titulo}</p>
              {p.detalhe && <p className="trilha__detalhe">{p.detalhe}</p>}
            </li>
          ))}
          {passosDaTrilha(t).length === 0 && <li className="nota">Nenhum registro ainda.</li>}
        </ol>
      )}
    </Sobreposicao>
  );
}

/** Envio sem confirmação: só a recepção decide se reenvia, para não mandar mensagem duplicada (US-15). */
function DecisaoIncerto({ idConsulta }: { idConsulta: string }) {
  const cliente = useQueryClient();
  const [acao, setAcao] = useState<'reenviar' | 'manter_sem_reenvio' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const resolver = useMutation({
    mutationFn: (a: 'reenviar' | 'manter_sem_reenvio') => notificacao.resolver(idConsulta, a),
    onSuccess: async () => {
      setAcao(null);
      await Promise.all([cliente.invalidateQueries({ queryKey: ['trilha', idConsulta] }), cliente.invalidateQueries({ queryKey: ['painel-lembretes'] })]);
    },
    onError: (falha) => setErro(statusDe(falha) === 409 ? 'Este envio já não está sem confirmação: outra pessoa decidiu ou a situação mudou.' : `A decisão não foi registrada: ${motivo(falha)}.`),
  });

  return (
    <div className="decisao">
      <p className="decisao__titulo">O WhatsApp não confirmou este envio</p>
      <p className="decisao__texto">A mensagem pode ter chegado ao paciente. Reenviar pode duplicá-la; manter sem reenvio registra que a recepção preferiu não arriscar.</p>
      <div className="decisao__acoes">
        <button type="button" className="botao botao--primario" onClick={() => { setErro(null); setAcao('reenviar'); }}>Reenviar</button>
        <button type="button" className="botao botao--secundario" onClick={() => { setErro(null); setAcao('manter_sem_reenvio'); }}>Manter sem reenvio</button>
      </div>
      {acao && (
        <Confirmacao titulo={acao === 'reenviar' ? 'Reenviar o lembrete?' : 'Manter sem reenvio?'} confirmar={acao === 'reenviar' ? 'Reenviar' : 'Manter sem reenvio'}
          ocupado={resolver.isPending} erro={erro} aoFechar={() => setAcao(null)} aoConfirmar={() => resolver.mutate(acao)}>
          <p>{acao === 'reenviar'
            ? 'O lembrete volta para a fila de envio. Se a primeira mensagem tiver chegado, o paciente recebe duas.'
            : 'Nenhuma nova mensagem será enviada. O envio continua registrado como sem confirmação.'}</p>
          <p className="nota">A decisão fica registrada com o seu nome.</p>
        </Confirmacao>
      )}
    </div>
  );
}
