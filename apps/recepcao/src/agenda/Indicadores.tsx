import { chaveDia } from '../formatacao';
import type { Consulta, Lembrete } from '../tipos';

export function Indicadores({ consultas, lembretes, totalPacientes, cadastroIndisponivel }: {
  consultas: Consulta[]; lembretes: Lembrete[]; totalPacientes?: number; cadastroIndisponivel: boolean;
}) {
  const hoje = chaveDia(new Date());
  const consultasHoje = consultas.filter((c) => c.status === 'agendada' && chaveDia(new Date(c.inicio)) === hoje).length;
  const programados = lembretes.filter((l) => l.status === 'programado').length;

  return (
    <div className="indicadores">
      <Indicador rotulo="Consultas hoje" valor={consultasHoje} />
      <Indicador rotulo="Lembretes programados" valor={programados} destaque />
      <Indicador rotulo="Pacientes no cadastro" valor={cadastroIndisponivel ? 'Indisponível' : totalPacientes ?? 'Carregando…'} />
    </div>
  );
}

function Indicador({ rotulo, valor, destaque }: { rotulo: string; valor: number | string; destaque?: boolean }) {
  return (
    <div className="cartao indicador">
      <span className="indicador__rotulo">{rotulo}</span>
      <strong className={`indicador__valor ${typeof valor === 'string' ? 'indicador__valor--estado' : ''} ${destaque ? 'indicador__valor--marca' : ''}`}>{valor}</strong>
    </div>
  );
}
