// US-13: trilha rastreável de um lembrete, aberta a partir da tela de lembretes.
import { useEffect, useState } from 'react';
import { notificacaoApi } from '../api/notificacao';
import { motivoDaFalha } from '../api/http';
import { Selo } from '../componentes/Selo';
import { dataHoraComSegundos, horaComSegundos } from '../formatacao';
import type { TrilhaLembrete as Trilha } from '../tipos';
import { linhaDoTempo } from './trilha';

type Estado = { fase: 'carregando' } | { fase: 'erro'; motivo: string } | { fase: 'pronta'; trilha: Trilha; em: number };

export function TrilhaLembrete({ idConsulta }: { idConsulta: string }) {
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
  return <ConteudoTrilha estado={estado} aoAtualizar={() => setTentativa((n) => n + 1)} />;
}

/** Parte visual, sem efeitos: renderizada nos testes com estados controlados. */
export function ConteudoTrilha({ estado, aoAtualizar }: { estado: Estado; aoAtualizar: () => void }) {
  if (estado.fase === 'carregando') return <p className="trilha__estado" role="status">Carregando trilha…</p>;
  if (estado.fase === 'erro') {
    return (
      <div className="trilha__estado" role="alert">
        <span>Não foi possível carregar a trilha ({estado.motivo}).</span>
        <button type="button" className="acao" onClick={aoAtualizar}>Tentar novamente</button>
      </div>
    );
  }
  const entradas = linhaDoTempo(estado.trilha);
  const chamadas = estado.trilha.tentativas.length;
  return (
    <div className="trilha">
      <p className="trilha__resumo">
        {chamadas === 0 ? 'Nenhuma chamada ao canal de envio.' : `${chamadas} chamada(s) ao canal de envio.`}
        {' '}Lida às {horaComSegundos(estado.em)}.{' '}
        <button type="button" className="acao" onClick={aoAtualizar}>Atualizar trilha</button>
      </p>
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
