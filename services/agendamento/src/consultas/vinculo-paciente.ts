import { idCorrelacaoConsulta, type PacienteAtualizado } from '@clinica/eventos';
import { prisma } from '../db';
import { SITUACOES_ATIVAS } from './servico';

const PREFIXO_CONSULTA = idCorrelacaoConsulta('');

export async function aplicarPacienteAtualizado(evento: PacienteAtualizado): Promise<void> {
  const { id_paciente, cpf, nome, telefone, revisao } = evento.payload;
  const idConsulta = evento.id_correlacao.startsWith(PREFIXO_CONSULTA)
    ? evento.id_correlacao.slice(PREFIXO_CONSULTA.length)
    : '';

  await prisma.$transaction(async (tx) => {
    const registro = await tx.eventoProcessado.createMany({
      data: { idEvento: evento.id_evento },
      skipDuplicates: true,
    });
    if (!registro.count) return;

    if (idConsulta) {
      await tx.consulta.updateMany({
        where: { id: idConsulta, pacienteCpf: cpf, vinculoPacientePendente: true },
        data: { idPaciente: id_paciente, vinculoPacientePendente: false },
      });
    }

    // US-27: cópia do contato para as solicitações do portal; a revisão impede regressão.
    await tx.pacienteContato.createMany({ data: { id: id_paciente, cpf, nome, telefone, revisao }, skipDuplicates: true });
    await tx.pacienteContato.updateMany({ where: { id: id_paciente, revisao: { lt: revisao } }, data: { nome, telefone, revisao } });

    // O CPF é imutável no Cadastro, por isso serve de chave mesmo antes do vínculo.
    await tx.consulta.updateMany({
      where: {
        pacienteCpf: cpf,
        status: { in: [...SITUACOES_ATIVAS] },
        OR: [{ pacienteRevisao: null }, { pacienteRevisao: { lt: revisao } }],
      },
      data: { pacienteNome: nome, pacienteTelefone: telefone, pacienteRevisao: revisao },
    });
  });
}