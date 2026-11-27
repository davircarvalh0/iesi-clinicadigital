import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, X } from 'lucide-react';
import { useState } from 'react';
import { useAgora, useLeitura } from '../app/leitura';
import { useUsuario } from '../app/sessao';
import { motivo, statusDe } from '../api/cliente';
import { agendamento, notificacao } from '../api/servicos';
import { relativo } from '../dominio/datas';
import { juntarOcorrencias } from '../dominio/eventos';
import { Atualizacao } from '../ui/componentes';

/**
 * O que os serviços fizeram, em tempo real: eventos publicados pelo Agendamento e o que a Notificação
 * fez com eles. É a vitrine da integração por eventos na demonstração.
 */
export function PainelIntegracao({ aoFechar }: { aoFechar: () => void }) {
  const usuario = useUsuario();
  const eventos = useLeitura(['integracao', 'eventos'], agendamento.eventos, { intervaloMs: 2000 });
  const atividades = useLeitura(['integracao', 'atividades'], notificacao.atividades, { intervaloMs: 2000 });
  const agora = useAgora();
  const ocorrencias = juntarOcorrencias(eventos.data ?? [], atividades.data ?? []);

  return (
    <aside className="integracao" aria-label="Integração ao vivo">
      <header className="integracao__topo">
        <div>
          <h2 className="integracao__titulo">Integração ao vivo</h2>
          <p className="integracao__sub">Eventos publicados e o que a Notificação fez com eles</p>
        </div>
        <button type="button" className="botao botao--quieto botao--icone" onClick={aoFechar} aria-label="Fechar painel"><X size={18} /></button>
      </header>

      <div className="integracao__fontes">
        <Atualizacao servico="Agendamento" frescor={eventos.frescor} atualizadoEm={eventos.atualizadoEm} />
        <Atualizacao servico="Notificação" frescor={atividades.frescor} atualizadoEm={atividades.atualizadoEm} />
      </div>

      {usuario.perfil === 'administrador' && <ControlesDemonstracao />}

      <ol className="linha-do-tempo" aria-live="polite">
        {ocorrencias.length === 0 && <li className="linha-do-tempo__vazia">Nenhum evento ainda. Agende uma consulta para ver a integração acontecer.</li>}
        {ocorrencias.map((o) => (
          <li key={o.chave} className={`ocorrencia ocorrencia--${o.tom}`}>
            <div className="ocorrencia__topo">
              <span className="ocorrencia__origem">{o.origem}</span>
              <time className="ocorrencia__quando" dateTime={o.em}>{relativo(o.em, agora)}</time>
            </div>
            <p className="ocorrencia__titulo">{o.titulo}</p>
            <p className="ocorrencia__detalhe">{o.detalhe}</p>
            {(o.tipo || o.idEvento) && (
              <p className="ocorrencia__codigos">
                {o.tipo && <code>{o.tipo}</code>}
                {o.idEvento && <code title={o.idEvento}>#{o.idEvento.slice(0, 8)}</code>}
              </p>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Controles de demonstração: só existem com TEST_CONTROLS=true e só para o administrador. */
function ControlesDemonstracao() {
  const cliente = useQueryClient();
  const consumo = useLeitura(['demo', 'consumo'], notificacao.consumo, { intervaloMs: 2000 });
  const [mensagem, setMensagem] = useState<string | null>(null);
  const alternar = useMutation({
    mutationFn: (ativo: boolean) => notificacao.definirConsumo(ativo),
    onSuccess: (dados) => cliente.setQueryData(['demo', 'consumo'], dados),
    onError: (e) => setMensagem(`Não foi possível alterar: ${motivo(e)}.`),
  });
  const duplicar = useMutation({
    mutationFn: agendamento.reenviarUltimoEvento,
    onSuccess: () => { setMensagem('Último evento reenviado com o mesmo identificador.'); void cliente.invalidateQueries({ queryKey: ['integracao'] }); },
    onError: (e) => setMensagem(statusDe(e) === 404 ? 'Ainda não há evento para reenviar.' : `Não foi possível reenviar: ${motivo(e)}.`),
  });

  if (consumo.isError && (statusDe(consumo.error) === 404 || statusDe(consumo.error) === 403)) {
    return <p className="demo demo--desligada">Controles de demonstração desligados neste ambiente (TEST_CONTROLS).</p>;
  }
  const noAr = consumo.data?.consumindo;

  return (
    <section className="demo" aria-label="Demonstração">
      <div className="demo__linha">
        <div>
          <p className="demo__nome">Notificação processando eventos</p>
          <p className="demo__estado">
            {consumo.data === undefined ? 'Consultando…' : noAr ? 'No ar' : `Fora do ar · ${consumo.data.naFila} evento(s) esperando na fila`}
          </p>
        </div>
        <button
          type="button" role="switch" aria-checked={!!noAr} aria-label="Notificação processando eventos"
          className={`chave ${noAr ? 'chave--ligada' : ''}`} disabled={consumo.data === undefined || alternar.isPending}
          onClick={() => { setMensagem(null); alternar.mutate(!noAr); }}
        ><span className="chave__botao" /></button>
      </div>
      <button type="button" className="botao botao--secundario botao--largo" disabled={duplicar.isPending} onClick={() => { setMensagem(null); duplicar.mutate(); }}>
        <Copy size={16} aria-hidden="true" /> Reenviar último evento (duplicado)
      </button>
      {mensagem && <p className="demo__mensagem" role="status">{mensagem}</p>}
    </section>
  );
}
