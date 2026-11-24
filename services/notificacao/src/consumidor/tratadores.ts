import type { AutorizacaoContatoAlterada, EventoConsulta, PacienteAtualizado } from '@clinica/eventos';
import type { Prisma } from '../../generated/prisma';
import { aplicarAutorizacao } from '../autorizacoes/servico';
import { CANAL_LEMBRETE } from '../config';
import * as lembretes from '../lembretes/servico';

export type EventoRecebido = EventoConsulta | PacienteAtualizado | AutorizacaoContatoAlterada;

/** Reação da Notificação a cada tipo de evento recebido. */
export async function tratarEvento(tx: Prisma.TransactionClient, evento: EventoRecebido): Promise<void> {
  if (evento.tipo === 'paciente.autorizacao_alterada') {
    await aplicarAutorizacao(tx, evento, CANAL_LEMBRETE);
    return;
  }
  if (evento.tipo === 'paciente.atualizado') {
    const { cpf, nome, telefone, revisao } = evento.payload;
    await tx.contatoPaciente.createMany({ data: { cpf, nome, telefone, revisao }, skipDuplicates: true });
    await tx.contatoPaciente.updateMany({ where: { cpf, revisao: { lt: revisao } }, data: { nome, telefone, revisao } });
    const contato = await tx.contatoPaciente.findUniqueOrThrow({ where: { cpf } });
    await tx.lembrete.updateMany({
      where: { pacienteCpf: cpf, status: { in: ['programado', 'falhou', 'bloqueado'] } },
      data: { pacienteNome: contato.nome, telefone: contato.telefone },
    });
    return;
  }
  // O evento do mestre pode chegar antes ou depois de consulta.agendada.
  const contato = await tx.contatoPaciente.findUnique({ where: { cpf: evento.payload.paciente.cpf } });
  const payload = contato ? { ...evento.payload, paciente: { ...evento.payload.paciente, nome: contato.nome, telefone: contato.telefone } } : evento.payload;
  switch (evento.tipo) {
    case 'consulta.agendada':
      return lembretes.programar(tx, payload, evento.id_evento);
    case 'consulta.reagendada':
      return lembretes.reprogramar(tx, payload, evento.id_evento);
    case 'consulta.cancelada':
      return lembretes.cancelar(tx, evento.payload, evento.id_evento);
  }
}
