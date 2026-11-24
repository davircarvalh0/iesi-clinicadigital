import { Bell, BellOff, CircleHelp, Clock, RotateCcw, X } from 'lucide-react';
import { Selo, type TomSelo } from '../componentes/Selo';
import { corDaEspecialidade } from '../dados/profissionais';
import { hora, horaComSegundos, iniciais, mascaraTelefone } from '../formatacao';
import {
  pendenciaDoLembrete, situacaoDesconhecida, situacaoVelha,
  type AcaoCancelamento, type Pendencia, type Situacao,
} from '../sincronizacao';
import type { Consulta, Lembrete, StatusLembrete } from '../tipos';

const SELO_LEMBRETE: Record<StatusLembrete, { tom: TomSelo; texto: string }> = {
  programado: { tom: 'marca', texto: 'Lembrete programado' },
  enviado: { tom: 'sucesso', texto: 'Lembrete enviado' },
  falhou: { tom: 'perigo', texto: 'Lembrete falhou' },
  cancelado: { tom: 'neutro', texto: 'Lembrete cancelado' },
  bloqueado: { tom: 'alerta', texto: 'Lembrete bloqueado' },
};

const TEXTO_PENDENCIA: Record<Pendencia, string> = {
  programacao: 'Aguardando a Notificação programar o lembrete.',
  remarcacao: 'A Notificação ainda tem o horário anterior: o lembrete será reprogramado quando a remarcação chegar.',
  cancelamento: 'A Notificação ainda não recebeu o cancelamento: o lembrete segue ativo até lá.',
};

/** Alterna os tons do avatar de forma estável pelo nome. */
const tomAvatar = (nome: string) =>
  [...nome].reduce((soma, letra) => soma + letra.charCodeAt(0), 0) % 2 === 0 ? 'verde' : 'ambar';

interface Props {
  consulta: Consulta;
  lembrete?: Lembrete;
  /** Situação da leitura de lembretes da Notificação. */
  situacaoLembretes: Situacao;
  /** Cancelamento pedido nesta tela, já conferido com a agenda. */
  acao?: AcaoCancelamento;
  aoRemarcar: () => void;
  aoCancelar: () => void;
}

export function ItemConsulta({ consulta: c, lembrete, situacaoLembretes, acao, aoRemarcar, aoCancelar }: Props) {
  const cancelada = c.status === 'cancelada';
  const desconhecido = situacaoDesconhecida(situacaoLembretes);
  const velho = situacaoVelha(situacaoLembretes);
  const pendencia = desconhecido ? null : pendenciaDoLembrete(c, lembrete);
  const selo = lembrete && !desconhecido ? SELO_LEMBRETE[lembrete.status] : null;
  const travado = acao?.fase === 'enviando' || acao?.fase === 'incerta';

  return (
    <article className={`consulta ${cancelada ? 'consulta--cancelada' : ''}`} aria-busy={acao?.fase === 'enviando'}>
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
          {desconhecido && (
            <Selo tom="neutro">
              <CircleHelp size={13} aria-hidden="true" />
              {situacaoLembretes === 'carregando' ? 'Consultando lembrete…' : 'Lembrete: situação desconhecida'}
            </Selo>
          )}
          {selo && (
            <span title={lembrete?.motivoFalha ?? undefined}>
              <Selo tom={velho ? 'neutro' : selo.tom}>
                {lembrete?.status === 'cancelado'
                  ? <BellOff size={13} aria-hidden="true" /> : <Bell size={13} aria-hidden="true" />}
                {' '}{selo.texto}{velho && ' · desatualizado'}
              </Selo>
            </span>
          )}
          {pendencia && (
            <Selo tom="alerta"><Clock size={13} aria-hidden="true" /> Sincronização pendente</Selo>
          )}
        </div>
        {pendencia && <span className="consulta__aviso">{TEXTO_PENDENCIA[pendencia]}</span>}
        {c.vinculoPacientePendente && <Selo tom="alerta">Vínculo com Cadastro pendente</Selo>}
        <EstadoAcao acao={acao} />
        {!cancelada && (
          <div className="consulta__acoes">
            <button className="acao" onClick={aoRemarcar} disabled={travado}>
              <RotateCcw size={16} aria-hidden="true" /> Remarcar
            </button>
            <button className="acao acao--perigo" onClick={aoCancelar} disabled={travado}>
              <X size={16} aria-hidden="true" /> {acao?.fase === 'enviando' ? 'Cancelando…' : 'Cancelar'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function EstadoAcao({ acao }: { acao?: AcaoCancelamento }) {
  if (!acao || acao.fase === 'enviando') return null;
  if (acao.fase === 'confirmada') {
    return (
      <span className="consulta__resultado consulta__resultado--ok" role="status">
        Cancelamento confirmado às {horaComSegundos(acao.em)}{acao.observacao ? ` (${acao.observacao})` : ''}
      </span>
    );
  }
  return (
    <span className={`consulta__resultado consulta__resultado--${acao.fase === 'falhou' ? 'erro' : 'alerta'}`} role="alert">
      {acao.mensagem}
    </span>
  );
}
