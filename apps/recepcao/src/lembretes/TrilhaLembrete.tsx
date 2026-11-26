// US-13: trilha rastreável de um lembrete, aberta a partir da tela de lembretes.
// US-15: quando o envio ficou sem confirmação, a recepção decide aqui (reenviar ou manter sem reenvio).
import { useEffect, useState, type FormEvent } from 'react';
import { notificacaoApi } from '../api/notificacao';
import { descreverFalha, motivoDaFalha } from '../api/http';
import { Selo } from '../componentes/Selo';
import { dataHoraComSegundos, horaComSegundos } from '../formatacao';
import type { TrilhaLembrete as Trilha } from '../tipos';
import { linhaDoTempo } from './trilha';

type Estado = { fase: 'carregando' } | { fase: 'erro'; motivo: string } | { fase: 'pronta'; trilha: Trilha; em: number };
export type AcaoIncerto = 'reenviar' | 'manter_sem_reenvio';

export function TrilhaLembrete({ idConsulta, aoAlterar }: { idConsulta: string; aoAlterar?: () => void }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    const controle = new AbortController();
    setEstado({ fase: 'carregando' });
    const inicio = Date.now();
    notificacaoApi.trilha(idConsulta, controle.signal)
      .then((trilha) => { if (!controle.signal.aborted) setEstado({ fase: 'pronta', trilha, em: inicio }); })
      .catch((erro) => { if (!controle.signal.aborted) setEstado({ fase: 'erro', motivo: motivoDaFalha(erro) }); });
    return () => controle.abort();
  }, [idConsulta, tentativa]);
  const decidir = async (acao: AcaoIncerto) => {
    await notificacaoApi.resolverIncerto(idConsulta, acao);
    setTentativa((n) => n + 1);
    aoAlterar?.();
  };
  return <ConteudoTrilha estado={estado} aoAtualizar={() => setTentativa((n) => n + 1)} aoDecidir={decidir} />;
}

interface PropsConteudo {
  estado: Estado;
  aoAtualizar: () => void;
  aoDecidir?: (acao: AcaoIncerto) => Promise<void>;
}

/** Parte visual: renderizada nos testes com estados controlados. */
export function ConteudoTrilha({ estado, aoAtualizar, aoDecidir }: PropsConteudo) {
  if (estado.fase === 'carregando') return <p className="trilha__estado" role="status">Carregando trilha…</p>;
  if (estado.fase === 'erro') {
    return (
      <div className="trilha__estado" role="alert">
        <span>Não foi possível carregar a trilha ({estado.motivo}).</span>
        <button type="button" className="acao" onClick={aoAtualizar}>Tentar novamente</button>
      </div>
    );
  }
  const { trilha } = estado;
  const entradas = linhaDoTempo(trilha);
  const chamadas = trilha.tentativas.length;
  const aguardaDecisao = trilha.lembrete.status === 'incerto' && !trilha.lembrete.incertoResolvidoEm;
  return (
    <div className="trilha">
      <p className="trilha__resumo">
        {chamadas === 0 ? 'Nenhuma chamada ao canal de envio.' : `${chamadas} chamada(s) ao canal de envio.`}
        {' '}Lida às {horaComSegundos(estado.em)}.{' '}
        <button type="button" className="acao" onClick={aoAtualizar}>Atualizar trilha</button>
      </p>
      {aguardaDecisao && aoDecidir && (
        <DecisaoIncerto consultaJaComecou={Date.parse(trilha.lembrete.inicioConsulta) <= Date.now()} aoDecidir={aoDecidir} />
      )}
      <ol className="trilha__lista">
        {entradas.map((e) => (
          <li key={e.id} className={`trilha__item trilha__item--${e.tipo}`}>
            <time dateTime={e.em}>{dataHoraComSegundos(e.em)}</time>
            <div>
              <Selo tom={e.tom}>{e.titulo}</Selo>
              {e.detalhe && <span className="trilha__detalhe">{e.detalhe}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

type FaseDecisao = { fase: 'pronta' } | { fase: 'enviando'; acao: AcaoIncerto } | { fase: 'erro'; mensagem: string };

export function DecisaoIncerto({ consultaJaComecou, aoDecidir }: {
  consultaJaComecou: boolean;
  aoDecidir: (acao: AcaoIncerto) => Promise<void>;
}) {
  const [estado, setEstado] = useState<FaseDecisao>({ fase: 'pronta' });
  const ocupado = estado.fase === 'enviando';

  async function decidir(acao: AcaoIncerto, e?: FormEvent) {
    e?.preventDefault();
    if (ocupado) return;
    setEstado({ fase: 'enviando', acao });
    try {
      await aoDecidir(acao);
      setEstado({ fase: 'pronta' });
    } catch (erro) {
      setEstado({ fase: 'erro', mensagem: descreverFalha(erro, acao === 'reenviar' ? 'o reenvio' : 'o registro da decisão') });
    }
  }

  return (
    <form className="decisao" onSubmit={(e) => void decidir('reenviar', e)} aria-labelledby="titulo-decisao">
      <p id="titulo-decisao" className="decisao__titulo">O WhatsApp não confirmou este envio</p>
      <p className="decisao__texto">
        A mensagem pode ter chegado ao paciente. Confira no gerenciador do WhatsApp ou com o paciente antes de decidir:
        reenviar pode duplicar a mensagem, e manter sem reenvio encerra as tentativas.
      </p>
      <p className="decisao__texto">Quem está decidindo: usuário autenticado.</p>
      <div className="decisao__acoes">
        <button type="submit" className="botao botao--primario" disabled={ocupado || consultaJaComecou}>
          {estado.fase === 'enviando' && estado.acao === 'reenviar' ? 'Reenviando…' : 'Reenviar'}
        </button>
        <button type="button" className="botao botao--secundario" disabled={ocupado}
          onClick={() => void decidir('manter_sem_reenvio')}>
          {estado.fase === 'enviando' && estado.acao === 'manter_sem_reenvio' ? 'Registrando…' : 'Manter sem reenvio'}
        </button>
      </div>
      {consultaJaComecou && <p className="decisao__texto">A consulta já começou: só é possível manter sem reenvio.</p>}
      {estado.fase === 'erro' && <p className="aviso aviso--erro" role="alert">{estado.mensagem}</p>}
    </form>
  );
}
