import { Copy } from 'lucide-react';
import { useState } from 'react';
import { agendamentoApi } from '../api/agendamento';
import { notificacaoApi } from '../api/notificacao';
import type { EstadoConsumo, EventoPublicado } from '../tipos';

interface Props {
  consumo?: EstadoConsumo;
  acessivel: boolean;
  eventos: EventoPublicado[];
  aoMudar: () => Promise<unknown>;
}

export function ModoDemonstracao({ consumo, acessivel, eventos, aoMudar }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const noAr = acessivel && consumo?.consumindo !== false;
  const ultimo = eventos.find((e) => !e.duplicado && e.publicadoEm);

  const executar = async (acao: () => Promise<unknown>) => {
    setOcupado(true);
    try {
      await acao();
      await aoMudar();
    } finally {
      setOcupado(false);
    }
  };

  const subtitulo = !acessivel
    ? 'Serviço inacessível'
    : noAr
      ? 'Processando eventos normalmente'
      : `Eventos esperando na fila: ${consumo?.naFila ?? 0}`;

  return (
    <section className="demo">
      <p className="demo__rotulo">Modo demonstração</p>

      <div className="demo__servico">
        <div>
          <strong className="demo__nome">Serviço de Notificação</strong>
          <span className="demo__subtitulo">{subtitulo}</span>
        </div>
        <label className={`interruptor ${noAr ? 'interruptor--ligado' : ''}`}>
          <span className="interruptor__texto">{noAr ? 'No ar' : 'Fora do ar'}</span>
          <input
            type="checkbox"
            role="switch"
            checked={noAr}
            disabled={!acessivel || ocupado}
            onChange={(e) => executar(() => notificacaoApi.definirConsumo(e.target.checked))}
          />
          <span className="interruptor__trilho" />
        </label>
      </div>

      <button
        className="demo__reenviar"
        disabled={!ultimo || ocupado}
        onClick={() => executar(agendamentoApi.reenviarUltimoEvento)}
      >
        <Copy size={17} /> Reenviar último evento (duplicado)
      </button>
      <p className="demo__legenda">
        {ultimo ? `Último: ${ultimo.tipo} · ${ultimo.pacienteNome}` : 'Publique um evento de consulta primeiro.'}
      </p>
    </section>
  );
}
