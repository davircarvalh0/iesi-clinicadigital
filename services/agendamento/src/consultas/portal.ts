import { z } from 'zod';
import type { Consulta } from '../../generated/prisma';
import { horariosLivres, noFusoDaClinica } from '../agenda/horario';
import { prisma } from '../db';
import { ErroHttp } from '../http/erros';
import { aplicarSituacao, bloquearPaciente, garantirHorarioLivre, registrarEvento, SITUACOES_ATIVAS } from './servico';

/** US-27: limite de consultas futuras marcadas pelo próprio paciente (evita ocupar a agenda inteira). */
export const LIMITE_CONSULTAS_FUTURAS = 3;

export const esquemaSolicitacao = z.object({
  profissionalId: z.uuid('Identificador do profissional inválido.'),
  inicio: z.iso.datetime({ offset: true, error: 'Data e hora inválidas. Use o formato ISO 8601 com fuso.' }).transform((v) => new Date(v)),
}).strict();

/** O que o paciente vê da própria consulta: sem dados de outros pacientes nem campos internos. */
export function paraPaciente(c: Consulta, agora = new Date()) {
  return {
    id: c.id, profissional: c.profissional, profissionalId: c.profissionalId, especialidade: c.especialidade,
    inicio: c.inicio.toISOString(), duracaoMinutos: c.duracaoMinutos, status: c.status,
    confirmadaEm: c.confirmadaEm?.toISOString() ?? null,
    podeConfirmar: c.status === 'agendada' && c.inicio > agora,
  };
}

export async function minhasConsultas(pacienteId: string) {
  const consultas = await prisma.consulta.findMany({ where: { idPaciente: pacienteId, vinculoPacientePendente: false }, orderBy: { inicio: 'asc' } });
  const agora = new Date();
  return consultas.map((c) => paraPaciente(c, agora));
}

/**
 * US-27: o paciente marca a própria consulta num horário livre da grade do profissional.
 * Os dados de contato vêm da cópia local do cadastro mestre, nunca do corpo da requisição.
 */
export function solicitar(pacienteId: string, { profissionalId, inicio }: z.infer<typeof esquemaSolicitacao>) {
  return prisma.$transaction(async (tx) => {
    const agora = new Date();
    const contato = await tx.pacienteContato.findUnique({ where: { id: pacienteId } });
    if (!contato) throw new ErroHttp(409, 'Seu cadastro ainda está sendo sincronizado. Tente de novo em instantes.');
    const profissional = await tx.profissional.findUnique({ where: { id: profissionalId }, include: { disponibilidades: true } });
    if (!profissional) throw new ErroHttp(404, 'Profissional não encontrado.');
    if (!profissional.ativo) throw new ErroHttp(409, 'Profissional inativo: não recebe novas consultas.');
    if (inicio <= agora) throw new ErroHttp(400, 'Escolha um horário futuro.');
    const naGrade = horariosLivres(noFusoDaClinica(inicio).data, profissional.duracaoConsultaMinutos, profissional.disponibilidades, [], agora)
      .some((h) => h.getTime() === inicio.getTime());
    if (!naGrade) throw new ErroHttp(409, 'Horário fora da agenda do profissional. Escolha um dos horários disponíveis.');
    await bloquearPaciente(tx, contato.cpf);
    const futuras = await tx.consulta.count({ where: { pacienteCpf: contato.cpf, status: { in: [...SITUACOES_ATIVAS] }, inicio: { gt: agora } } });
    if (futuras >= LIMITE_CONSULTAS_FUTURAS) throw new ErroHttp(409, `Você já tem ${futuras} consultas marcadas. Para marcar outra, fale com a recepção.`);
    await garantirHorarioLivre(tx, profissional.id, inicio, profissional.duracaoConsultaMinutos, '', contato.cpf);
    const consulta = await tx.consulta.create({
      data: {
        idPaciente: pacienteId, vinculoPacientePendente: false, pacienteRevisao: contato.revisao,
        pacienteNome: contato.nome, pacienteCpf: contato.cpf, pacienteTelefone: contato.telefone,
        profissional: profissional.nome, profissionalId: profissional.id, especialidade: profissional.especialidade,
        inicio, duracaoMinutos: profissional.duracaoConsultaMinutos,
      },
    });
    await registrarEvento(tx, 'consulta.agendada', consulta);
    return paraPaciente(consulta, agora);
  });
}

/** US-27: o paciente confirma a própria consulta. Consulta de outro paciente responde 404 (não revela que existe). */
export function confirmarPeloPaciente(pacienteId: string, idConsulta: string) {
  return prisma.$transaction(async (tx) => {
    const dono = await tx.consulta.findUnique({ where: { id: idConsulta }, select: { idPaciente: true, vinculoPacientePendente: true } });
    if (!dono || dono.vinculoPacientePendente || dono.idPaciente !== pacienteId) throw new ErroHttp(404, 'Consulta não encontrada');
    return paraPaciente(await aplicarSituacao(tx, idConsulta, 'confirmada', 'portal'));
  });
}
