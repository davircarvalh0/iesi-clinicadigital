import { horaComSegundos } from '../formatacao';
import type { Situacao } from '../sincronizacao';

export interface EstadoRecurso {
  nome: string;
  situacao: Situacao;
  atualizadoEm: number | null;
}

const TOM: Record<Situacao, string> = {
  carregando: 'neutro',
  atualizado: 'sucesso',
  atrasado: 'alerta',
  desatualizado: 'perigo',
  indisponivel: 'perigo',
};

export function textoSituacao({ situacao, atualizadoEm }: EstadoRecurso): string {
  const ultimo = atualizadoEm === null ? '' : horaComSegundos(atualizadoEm);
  switch (situacao) {
    case 'carregando': return 'conectando…';
    case 'atualizado': return `atualizado às ${ultimo}`;
    case 'atrasado': return `atualização atrasada · último dado às ${ultimo}`;
    case 'desatualizado': return `indisponível · último dado às ${ultimo}`;
    case 'indisponivel': return 'indisponível · situação desconhecida';
  }
}

interface Props {
  recursos: EstadoRecurso[];
  /** Consultas cuja última alteração ainda não aparece na Notificação. */
  pendentes: number;
}

/** Estado e horário da última atualização de cada serviço consultado pela tela (US-18). */
export function EstadoSincronizacao({ recursos, pendentes }: Props) {
  return (
    <section className="sincronizacao" aria-label="Sincronização com os serviços">
      <ul className="sincronizacao__lista">
        {recursos.map((r) => (
          <li key={r.nome} className={`sincronizacao__item sincronizacao__item--${TOM[r.situacao]}`}>
            <span className="chip__ponto" aria-hidden="true" />
            <strong>{r.nome}</strong> · {textoSituacao(r)}
          </li>
        ))}
      </ul>
      <p className="sincronizacao__pendentes" role="status">
        {pendentes > 0
          ? `Sincronização pendente em ${pendentes} consulta${pendentes > 1 ? 's' : ''}: a Notificação ainda não refletiu a última alteração.`
          : ''}
      </p>
    </section>
  );
}
