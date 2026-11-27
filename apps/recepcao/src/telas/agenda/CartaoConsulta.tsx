import { Bell, BellOff, CalendarClock, Check, CircleHelp, Clock, Link2Off, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Consulta, Lembrete } from '../../api/tipos';
import { dataHora, hora, horaSeg } from '../../dominio/datas';
import { telefone } from '../../dominio/documentos';
import { desconhecido, velho, type Frescor } from '../../dominio/frescor';
import { antecedenciaDeDemonstracao, pendenciaDe, SITUACAO, TEXTO_PENDENCIA } from '../../dominio/lembretes';
import { Confirmacao, Selo } from '../../ui/componentes';
import type { EstadoCancelamento } from './cancelamentos';
import type { EstadoSituacao, NovaSituacao } from './situacao';

interface Props {
  consulta: Consulta;
  lembrete?: Lembrete;
  frescorLembretes: Frescor;
  cancelamento?: EstadoCancelamento;
  situacao?: EstadoSituacao;
  aoRemarcar: () => void;
  aoCancelar: () => void;
  aoMudarSituacao: (nova: NovaSituacao) => void;
}

export function CartaoConsulta({ consulta: c, lembrete, frescorLembretes, cancelamento, situacao, aoRemarcar, aoCancelar, aoMudarSituacao }: Props) {
  const [confirmando, setConfirmando] = useState<'cancelar' | 'concluida' | 'falta' | null>(null);
  const cancelada = c.status === 'cancelada';
  const encerrada = c.status === 'concluida' || c.status === 'falta';
  const ativa = !cancelada && !encerrada;
  const jaComecou = new Date(c.inicio) <= new Date();
  const semLeitura = desconhecido(frescorLembretes);
  const pendencia = semLeitura ? null : pendenciaDe(c, lembrete);
  const travado = cancelamento?.fase === 'enviando' || cancelamento?.fase === 'incerto'
    || situacao?.fase === 'enviando' || situacao?.fase === 'incerto';

  return (
    <li className={`horario ${cancelada ? 'horario--cancelado' : ''}`} aria-busy={cancelamento?.fase === 'enviando' || situacao?.fase === 'enviando'}>
      <time className="horario__hora" dateTime={c.inicio}>{hora(c.inicio)}</time>
      <article className="consulta">
        <div className="consulta__principal">
          <h3 className="consulta__paciente">
            {c.idPaciente ? <Link to={`/pacientes/${c.idPaciente}`}>{c.pacienteNome}</Link> : c.pacienteNome}
          </h3>
          <p className="consulta__detalhes">
            {c.profissional}, {c.especialidade.toLowerCase()} <span className="consulta__fone">{telefone(c.pacienteTelefone)}</span>
          </p>
          <div className="consulta__selos">
            {cancelada && <Selo tom="perigo">Cancelada</Selo>}
            {c.status === 'confirmada' && <Selo tom="info">Confirmada</Selo>}
            {c.status === 'concluida' && <Selo tom="ok">Concluída</Selo>}
            {c.status === 'falta' && <Selo tom="perigo">Faltou</Selo>}
            <SeloLembrete lembrete={lembrete} frescor={frescorLembretes} cancelada={cancelada} />
            {pendencia && <Selo tom="alerta"><Clock size={13} aria-hidden="true" /> Sincronização pendente</Selo>}
            {c.vinculoPacientePendente && <Selo tom="alerta" titulo="O Cadastro ainda não vinculou esta consulta a um paciente"><Link2Off size={13} aria-hidden="true" /> Vínculo com o Cadastro pendente</Selo>}
            {!semLeitura && antecedenciaDeDemonstracao(lembrete?.antecedenciaMinutos) && (
              <Selo tom="marca">Demonstração: lembrete {lembrete!.antecedenciaMinutos} min antes</Selo>
            )}
          </div>
          {pendencia && <p className="consulta__nota">{TEXTO_PENDENCIA[pendencia]}</p>}
          {!semLeitura && lembrete?.motivoFalha && (
            <p className="consulta__nota consulta__nota--falha">
              {lembrete.motivoFalha}{lembrete.tentativas > 0 && ` (${lembrete.tentativas} tentativa${lembrete.tentativas > 1 ? 's' : ''})`}
            </p>
          )}
          <ResultadoCancelamento estado={cancelamento} />
          <ResultadoSituacao estado={situacao} />
        </div>

        {ativa && (
          <div className="consulta__acoes">
            <button type="button" className="botao botao--quieto" onClick={aoRemarcar} disabled={travado}>
              <CalendarClock size={16} aria-hidden="true" /> Remarcar
            </button>
            {c.status === 'agendada' && !jaComecou && (
              <button type="button" className="botao botao--quieto" onClick={() => aoMudarSituacao('confirmada')} disabled={travado}>
                <Check size={16} aria-hidden="true" /> Confirmar
              </button>
            )}
            {jaComecou && (
              <>
                <button type="button" className="botao botao--quieto" onClick={() => setConfirmando('concluida')} disabled={travado}>
                  <Check size={16} aria-hidden="true" /> Concluída
                </button>
                <button type="button" className="botao botao--quieto botao--texto-perigo" onClick={() => setConfirmando('falta')} disabled={travado}>
                  <X size={16} aria-hidden="true" /> Faltou
                </button>
              </>
            )}
            <button type="button" className="botao botao--quieto botao--texto-perigo" onClick={() => setConfirmando('cancelar')} disabled={travado}>
              <X size={16} aria-hidden="true" /> {cancelamento?.fase === 'enviando' ? 'Cancelando…' : 'Cancelar'}
            </button>
          </div>
        )}
      </article>

      {confirmando === 'cancelar' && (
        <Confirmacao
          titulo="Cancelar consulta?"
          confirmar="Cancelar consulta"
          perigo
          aoFechar={() => setConfirmando(null)}
          aoConfirmar={() => { setConfirmando(null); aoCancelar(); }}
        >
          <p><strong>{c.pacienteNome}</strong> com {c.profissional}, {dataHora(c.inicio)}.</p>
          <p>O lembrete programado será cancelado quando a Notificação receber o aviso. Se ele já tiver sido enviado, continua registrado.</p>
        </Confirmacao>
      )}
      {confirmando === 'concluida' && (
        <Confirmacao
          titulo="Marcar consulta como concluída?"
          confirmar="Marcar como concluída"
          aoFechar={() => setConfirmando(null)}
          aoConfirmar={() => { setConfirmando(null); aoMudarSituacao('concluida'); }}
        >
          <p><strong>{c.pacienteNome}</strong> com {c.profissional}, {dataHora(c.inicio)}.</p>
          <p>Depois de concluída, a consulta não pode mais ser remarcada ou cancelada pela tela.</p>
        </Confirmacao>
      )}
      {confirmando === 'falta' && (
        <Confirmacao
          titulo="Registrar falta do paciente?"
          confirmar="Registrar falta"
          perigo
          aoFechar={() => setConfirmando(null)}
          aoConfirmar={() => { setConfirmando(null); aoMudarSituacao('falta'); }}
        >
          <p><strong>{c.pacienteNome}</strong> com {c.profissional}, {dataHora(c.inicio)}.</p>
          <p>Depois de registrada, a falta não pode mais ser desfeita pela tela.</p>
        </Confirmacao>
      )}
    </li>
  );
}

function SeloLembrete({ lembrete, frescor, cancelada }: { lembrete?: Lembrete; frescor: Frescor; cancelada: boolean }) {
  if (cancelada && (frescor === 'carregando' || frescor === 'indisponivel')) return null;
  if (frescor === 'carregando') return <Selo><CircleHelp size={13} aria-hidden="true" /> Consultando lembrete…</Selo>;
  if (frescor === 'indisponivel') return <Selo titulo="A Notificação não respondeu"><CircleHelp size={13} aria-hidden="true" /> Lembrete: situação desconhecida</Selo>;
  if (!lembrete) return cancelada ? null : <Selo><BellOff size={13} aria-hidden="true" /> Sem lembrete ainda</Selo>;
  const s = SITUACAO[lembrete.status];
  const antigo = velho(frescor);
  const texto = lembrete.status === 'programado' ? `Lembrete ${dataHora(lembrete.enviarEm)}` : s.nome;
  return (
    <Selo tom={antigo ? 'neutro' : s.tom} titulo={antigo ? 'Último dado conhecido; a Notificação não está respondendo' : s.descricao}>
      {lembrete.status === 'cancelado' ? <BellOff size={13} aria-hidden="true" /> : <Bell size={13} aria-hidden="true" />}
      {texto}{antigo && ' (pode estar desatualizado)'}
    </Selo>
  );
}

function ResultadoCancelamento({ estado }: { estado?: EstadoCancelamento }) {
  if (!estado || estado.fase === 'enviando') return null;
  if (estado.fase === 'confirmado') {
    return <p className="consulta__resultado consulta__resultado--ok" role="status">Cancelamento confirmado às {horaSeg(estado.em)}{estado.observacao && ` (${estado.observacao})`}.</p>;
  }
  if (estado.fase === 'recusado') return <p className="consulta__resultado consulta__resultado--erro" role="alert">{estado.mensagem}</p>;
  return (
    <p className="consulta__resultado consulta__resultado--alerta" role="alert">
      O Agendamento não respondeu. Ainda não dá para saber se a consulta foi cancelada. A tela confere sozinha na próxima atualização; não repita o pedido.
    </p>
  );
}

function ResultadoSituacao({ estado }: { estado?: EstadoSituacao }) {
  if (!estado || estado.fase === 'enviando') return null;
  if (estado.fase === 'confirmado') return <p className="consulta__resultado consulta__resultado--ok" role="status">Situação atualizada.</p>;
  if (estado.fase === 'recusado') return <p className="consulta__resultado consulta__resultado--erro" role="alert">{estado.mensagem}</p>;
  return (
    <p className="consulta__resultado consulta__resultado--alerta" role="alert">
      O Agendamento não respondeu. Ainda não dá para saber se a situação mudou. A tela confere sozinha na próxima atualização; não repita o pedido.
    </p>
  );
}
