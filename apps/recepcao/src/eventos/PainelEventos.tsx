import { useMemo } from 'react';
import { tempoRelativo } from '../formatacao';
import { useAgora } from '../hooks/useAgora';
import type { Atividade, EventoPublicado } from '../tipos';
import { montarFeed } from './feed';

interface Props {
  eventos: EventoPublicado[];
  atividades: Atividade[];
  notificacaoNoAr: boolean;
  notificacaoAcessivel: boolean;
}

const NOME_SERVICO = { agendamento: 'Agendamento', notificacao: 'Notificação' };

export function PainelEventos({ eventos, atividades, notificacaoNoAr, notificacaoAcessivel }: Props) {
  const agora = useAgora();
  const itens = useMemo(() => montarFeed(eventos, atividades), [eventos, atividades]);

  return (
    <section className="cartao eventos">
      <header className="eventos__cabecalho">
        <h2 className="eventos__titulo">
          <span className="ao-vivo" /> Eventos em tempo real
        </h2>
        <div className="eventos__servicos">
          {/* O Cadastro único é a próxima etapa do projeto; ainda não existe serviço para ele. */}
          <span className="chip chip--apagado" title="Próxima etapa: serviço ainda não existe">
            <span className="chip__ponto" /> Cadastro único
          </span>
          <span className={`chip ${notificacaoNoAr ? 'chip--marca' : 'chip--perigo'}`}>
            <span className="chip__ponto" /> Notificação · {notificacaoAcessivel ? (notificacaoNoAr ? 'no ar' : 'fora do ar') : 'inacessível'}
          </span>
        </div>
      </header>

      <div className="eventos__corpo">
        {itens.length === 0 ? (
          <p className="eventos__vazio">
            Nenhum evento ainda. Marque, remarque ou cancele uma consulta e acompanhe aqui cada serviço reagindo.
          </p>
        ) : (
          <ol className="feed">
            {itens.map((item) => (
              <li key={item.id} className={`feed__item feed__item--${item.tom}`}>
                <span className="feed__marcador" />
                <div className="feed__conteudo">
                  <div className="feed__topo">
                    <span className={`feed__servico feed__servico--${item.servico}`}>{NOME_SERVICO[item.servico]}</span>
                    <time className="feed__quando">{tempoRelativo(item.quando, agora)}</time>
                  </div>
                  <strong className="feed__titulo">{item.titulo}</strong>
                  <span className="feed__detalhe">{item.detalhe}</span>
                  {(item.tipo || item.idEvento) && (
                    <span className="feed__codigo">
                      {item.tipo && <code>{item.tipo}</code>}
                      {item.idEvento && <code title={item.idEvento}>#{item.idEvento.slice(0, 8)}</code>}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
