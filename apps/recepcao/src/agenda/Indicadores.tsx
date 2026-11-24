import { chaveDia } from '../formatacao';
import { situacaoDesconhecida, situacaoVelha, type Situacao } from '../sincronizacao';
import type { Consulta, Lembrete } from '../tipos';

interface Props {
  consultas: Consulta[];
  lembretes: Lembrete[];
  situacaoConsultas: Situacao;
  situacaoLembretes: Situacao;
  totalPacientes?: number;
  cadastroIndisponivel: boolean;
}

/** Contagem com a confiabilidade da fonte: sem dado não vira 0, dado velho não parece atual. */
function valorDe(valor: number, situacao: Situacao): number | string {
  if (situacaoDesconhecida(situacao)) return situacao === 'carregando' ? 'Carregando…' : 'Indisponível';
  return situacaoVelha(situacao) ? `${valor} · desatualizado` : valor;
}

export function Indicadores({ consultas, lembretes, situacaoConsultas, situacaoLembretes, totalPacientes, cadastroIndisponivel }: Props) {
  const hoje = chaveDia(new Date());
  const consultasHoje = consultas.filter((c) => c.status === 'agendada' && chaveDia(new Date(c.inicio)) === hoje).length;
  const programados = lembretes.filter((l) => l.status === 'programado').length;

  return (
    <div className="indicadores">
      <Indicador rotulo="Consultas hoje" valor={valorDe(consultasHoje, situacaoConsultas)} />
      <Indicador rotulo="Lembretes programados" valor={valorDe(programados, situacaoLembretes)} destaque />
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
