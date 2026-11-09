import { idCorrelacaoConsulta, type PacienteAtualizado } from '@clinica/eventos';
import { prisma } from '../db';

const PREFIXO_CONSULTA = idCorrelacaoConsulta('');

export async function confirmarVinculoPaciente(evento: PacienteAtualizado): Promise<void> {
  if (!evento.id_correlacao.startsWith(PREFIXO_CONSULTA)) return;
  const idConsulta = evento.id_correlacao.slice(PREFIXO_CONSULTA.length);
  if (!idConsulta) return;

  await prisma.$transaction(async (tx) => {
    const registro = await tx.eventoProcessado.createMany({
      data: { idEvento: evento.id_evento },
      skipDuplicates: true,
    });
    if (!registro.count) return;

    await tx.consulta.updateMany({
      where: { id: idConsulta, pacienteCpf: evento.payload.cpf, vinculoPacientePendente: true },
      data: { idPaciente: evento.payload.id_paciente, vinculoPacientePendente: false },
    });
  });
}
