import { useState } from 'react';
import type { Usuario } from './acesso';
import { motivoDaFalha, requisitar } from './api/http';
import { dataHora } from './formatacao';
import { usePolling } from './hooks/usePolling';

/** Consulta como o paciente a vê (US-27): só as próprias, sem dados de outros pacientes. */
export interface ConsultaPaciente {
  id: string; profissional: string; especialidade: string; inicio: string; duracaoMinutos: number;
  status: 'agendada' | 'confirmada' | 'cancelada' | 'concluida' | 'falta'; podeConfirmar: boolean;
}
const ROTULO: Record<ConsultaPaciente['status'], string> = {
  agendada: 'Agendada', confirmada: 'Confirmada', cancelada: 'Cancelada', concluida: 'Concluída', falta: 'Falta',
};
const carregar = () => requisitar<ConsultaPaciente[]>('/api/agendamento/pacientes/minha-conta/consultas');

/** Portal do paciente (mínimo): lista as próprias consultas e confirma presença. */
export function PortalPaciente({ usuario, sair }: { usuario: Usuario; sair: () => void }) {
  const consultas = usePolling(carregar, 30000);
  const [mensagem, setMensagem] = useState('');
  async function confirmar(id: string) {
    setMensagem('');
    try {
      await requisitar(`/api/agendamento/consultas/${encodeURIComponent(id)}/confirmar`, { method: 'PATCH', body: '{}' });
      setMensagem('Presença confirmada. Obrigado!');
      await consultas.recarregar();
    } catch (e) { setMensagem(`Não foi possível confirmar: ${motivoDaFalha(e)}.`); }
  }
  return <main className="principal">
    <header className="cabecalho"><h1>Minhas consultas · {usuario.nome}</h1><button className="botao botao--secundario" onClick={sair}>Sair</button></header>
    {mensagem && <p role="status">{mensagem}</p>}
    {consultas.erro && <p role="alert">Não foi possível atualizar suas consultas.</p>}
    {consultas.dados?.map((c) => <article className="cartao lista" key={c.id}>
      <p>{dataHora(c.inicio)} · {c.profissional} ({c.especialidade}) · {ROTULO[c.status]}</p>
      {c.podeConfirmar && <button className="botao botao--primario" onClick={() => void confirmar(c.id)}>Confirmar presença</button>}
    </article>)}
    {consultas.dados?.length === 0 && <p>Você ainda não tem consultas. Para marcar, fale com a recepção.</p>}
  </main>;
}
