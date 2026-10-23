import { Bell, BellOff, RotateCcw, X } from 'lucide-react';
import { Selo, type TomSelo } from '../componentes/Selo';
import { corDaEspecialidade } from '../dados/profissionais';
import { hora, iniciais, mascaraTelefone } from '../formatacao';
import type { Consulta, Lembrete, StatusLembrete } from '../tipos';

const SELO_LEMBRETE: Record<StatusLembrete, { tom: TomSelo; texto: string }> = {
  programado: { tom: 'marca', texto: 'Lembrete programado' },
  enviado: { tom: 'sucesso', texto: 'Lembrete enviado' },
  falhou: { tom: 'perigo', texto: 'Lembrete falhou' },
  cancelado: { tom: 'neutro', texto: 'Lembrete cancelado' },
};

/** Alterna os tons do avatar de forma estável pelo nome. */
const tomAvatar = (nome: string) =>
  [...nome].reduce((soma, letra) => soma + letra.charCodeAt(0), 0) % 2 === 0 ? 'verde' : 'ambar';

interface Props {
  consulta: Consulta;
  lembrete?: Lembrete;
  aoRemarcar: () => void;
  aoCancelar: () => void;
}

export function ItemConsulta({ consulta: c, lembrete, aoRemarcar, aoCancelar }: Props) {
  const cancelada = c.status === 'cancelada';
  const selo = lembrete ? SELO_LEMBRETE[lembrete.status] : null;

  return (
    <article className={`consulta ${cancelada ? 'consulta--cancelada' : ''}`}>
      <time className="consulta__hora">{hora(c.inicio)}</time>
      <span className={`avatar avatar--${tomAvatar(c.pacienteNome)}`}>{iniciais(c.pacienteNome)}</span>

      <div className="consulta__dados">
        <strong className="consulta__nome">{c.pacienteNome}</strong>
        <span className="consulta__detalhes">
          <span className="consulta__profissional">{c.profissional}</span>
          <span className="consulta__especialidade">
            <span className="ponto" style={{ background: corDaEspecialidade(c.especialidade) }} />
            {c.especialidade}
          </span>
          <span className="consulta__telefone">{mascaraTelefone(c.pacienteTelefone)}</span>
        </span>
      </div>

      <div className="consulta__lateral">
        <div className="consulta__selos">
          <Selo tom={cancelada ? 'perigo' : 'info'}>{cancelada ? 'Cancelada' : 'Agendada'}</Selo>
          {selo ? (
            <span title={lembrete?.motivoFalha ?? undefined}>
              <Selo tom={selo.tom}>
                {lembrete?.status === 'cancelado' ? <BellOff size={13} /> : <Bell size={13} />} {selo.texto}
              </Selo>
            </span>
          ) : (
            <Selo tom="neutro">
              <Bell size={13} /> Aguardando Notificação
            </Selo>
          )}
        </div>
        {!cancelada && (
          <div className="consulta__acoes">
            <button className="acao" onClick={aoRemarcar}>
              <RotateCcw size={16} /> Remarcar
            </button>
            <button className="acao acao--perigo" onClick={aoCancelar}>
              <X size={16} /> Cancelar
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
