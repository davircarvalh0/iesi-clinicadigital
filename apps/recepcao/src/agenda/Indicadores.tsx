import { chaveDia } from '../formatacao';
import type { Consulta, Lembrete } from '../tipos';

export function Indicadores({ consultas, lembretes }: { consultas: Consulta[]; lembretes: Lembrete[] }) {
  const hoje = chaveDia(new Date());
  const consultasHoje = consultas.filter((c) => c.status === 'agendada' && chaveDia(new Date(c.inicio)) === hoje).length;
  const programados = lembretes.filter((l) => l.status === 'programado').length;
  // Até o Cadastro único existir, o total de pacientes é o de CPFs distintos na agenda.
  const pacientes = new Set(consultas.map((c) => c.pacienteCpf)).size;

  return (
    <div className="indicadores">
      <Indicador rotulo="Consultas hoje" valor={consultasHoje} />
      <Indicador rotulo="Lembretes programados" valor={programados} destaque />
      <Indicador rotulo="Pacientes no cadastro" valor={pacientes} />
    </div>
  );
}

function Indicador({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className="cartao indicador">
      <span className="indicador__rotulo">{rotulo}</span>
      <strong className={`indicador__valor ${destaque ? 'indicador__valor--marca' : ''}`}>{valor}</strong>
    </div>
  );
}
