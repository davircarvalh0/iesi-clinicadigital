import { useEffect, useState } from 'react';
import { cadastroApi, type Autorizacao } from '../api/cadastro';
import { NOME_CANAL } from './AutorizacoesContato';

export function HistoricoAutorizacoes({ idPaciente, versao }: { idPaciente: string; versao: string }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<Autorizacao[] | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!aberto) return;
    const controle = new AbortController();
    setDados(null); setErro(false);
    cadastroApi.historicoAutorizacoes(idPaciente, controle.signal).then(({ historico }) => {
      if (!controle.signal.aborted) setDados(historico);
    }).catch(() => { if (!controle.signal.aborted) setErro(true); });
    return () => controle.abort();
  }, [idPaciente, versao, aberto, tentativa]);
  return <section className="campo--inteiro">
    <button type="button" className="botao botao--secundario" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
      {aberto ? 'Ocultar histórico' : 'Ver histórico de autorizações'}
    </button>
    {aberto && <div aria-live="polite">
      {erro && <p>Não foi possível consultar o histórico. <button type="button" onClick={() => setTentativa(n => n + 1)}>Tentar novamente</button></p>}
      {!dados && !erro && <p>Carregando histórico…</p>}
      {dados?.length === 0 && <p>Nenhum registro de autorização.</p>}
      {dados && <ul>{dados.map(a => <li key={`${a.canal}-${a.versao}`}>
        {NOME_CANAL[a.canal]} · {a.situacao === 'autorizado' ? 'Autorizado' : 'Revogado'} · {a.origem ?? '—'} · versão {a.versao}
        {a.registradoEm && ` · ${new Date(a.registradoEm).toLocaleString('pt-BR', { timeZone: 'America/Recife' })}`}
      </li>)}</ul>}
    </div>}
  </section>;
}
