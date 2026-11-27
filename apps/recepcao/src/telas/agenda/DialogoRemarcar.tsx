import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { motivo, tipoDaFalha } from '../../api/cliente';
import { agendamento } from '../../api/servicos';
import type { Consulta } from '../../api/tipos';
import { chaveDia, dataHora, hora, hoje, momentoRecife } from '../../dominio/datas';
import { Aviso, Campo, Sobreposicao } from '../../ui/componentes';

export function DialogoRemarcar({ consulta, aoFechar, aoRemarcar }: { consulta: Consulta; aoFechar: () => void; aoRemarcar: () => Promise<unknown> }) {
  const [dia, setDia] = useState(() => (chaveDia(consulta.inicio) < hoje() ? hoje() : chaveDia(consulta.inicio)));
  const [horario, setHorario] = useState(() => hora(consulta.inicio));
  const [erro, setErro] = useState<string | null>(null);
  const novoInicio = momentoRecife(dia, horario);
  const igual = new Date(novoInicio).getTime() === new Date(consulta.inicio).getTime();

  const remarcar = useMutation({
    mutationFn: () => agendamento.remarcar(consulta.id, novoInicio),
    onSuccess: async () => { await aoRemarcar(); aoFechar(); },
    onError: (falha) => {
      setErro(tipoDaFalha(falha) === 'incerta'
        ? 'O Agendamento não respondeu, então não dá para saber se a remarcação foi gravada. Confira a agenda antes de tentar de novo.'
        : `A consulta não foi remarcada: ${motivo(falha)}.`);
      void aoRemarcar();
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (igual || remarcar.isPending) return;
    setErro(null);
    remarcar.mutate();
  };

  return (
    <Sobreposicao titulo="Remarcar consulta" largura="estreita" aoFechar={aoFechar}
      subtitulo={<>{consulta.pacienteNome} com {consulta.profissional}. Hoje marcada para {dataHora(consulta.inicio)}.</>}
      rodape={<>
        <button type="button" className="botao botao--quieto" onClick={aoFechar}>Voltar</button>
        <button type="submit" form="remarcar" className="botao botao--primario" disabled={igual || remarcar.isPending}>{remarcar.isPending ? 'Remarcando…' : 'Remarcar'}</button>
      </>}>
      <form id="remarcar" className="formulario" onSubmit={enviar}>
        <div className="formulario__linha">
          <Campo rotulo="Nova data"><input type="date" min={hoje()} value={dia} onChange={(e) => setDia(e.target.value)} required /></Campo>
          <Campo rotulo="Novo horário"><input type="time" step={300} value={horario} onChange={(e) => setHorario(e.target.value)} required /></Campo>
        </div>
        <p className="nota">O lembrete é reprogramado para o novo horário assim que a Notificação receber a remarcação.</p>
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </form>
    </Sobreposicao>
  );
}
