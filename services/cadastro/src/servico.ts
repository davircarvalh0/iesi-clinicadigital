import { criarEnvelope } from '@clinica/eventos';
import { Prisma, type Paciente } from '../generated/prisma';
import { prisma } from './db';
import { esquemaBusca, esquemaBuscaCpf, esquemaContato, esquemaPacienteAgendado } from './validacao';

export class ErroCadastro extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem); }
}

async function enfileirar(tx: Prisma.TransactionClient, paciente: Paciente, correlacao: string) {
  const evento = criarEnvelope({
    tipo: 'paciente.atualizado', origem: 'cadastro', id_correlacao: correlacao,
    payload: {
      id_paciente: paciente.id, cpf: paciente.cpf, nome: paciente.nome,
      telefone: paciente.telefone, email: paciente.email, revisao: paciente.revisao,
    },
  });
  await tx.eventoSaida.create({ data: {
    idEvento: evento.id_evento, tipo: evento.tipo, envelope: evento as unknown as Prisma.InputJsonValue,
  } });
}

export async function listar(entrada: unknown) {
  const { busca, pagina, tamanhoPagina } = esquemaBusca.parse(entrada);
  const cpf = busca.replace(/\D/g, '');
  const where: Prisma.PacienteWhereInput = busca ? (/^[\d.\-\s]+$/.test(busca) && cpf
    ? { cpf: { contains: cpf } }
    : { nome: { contains: busca, mode: 'insensitive' } }) : {};
  // Uma fotografia consistente para lista e contadores, independentemente da agenda.
  const [pacientes, totalFiltrado, total] = await prisma.$transaction([
    prisma.paciente.findMany({ where, orderBy: [{ nome: 'asc' }, { id: 'asc' }], skip: (pagina - 1) * tamanhoPagina, take: tamanhoPagina }),
    prisma.paciente.count({ where }), prisma.paciente.count(),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { pacientes, total, totalFiltrado, pagina, tamanhoPagina };
}

export function buscarPorCpf(entrada: unknown) {
  const { cpf } = esquemaBuscaCpf.parse(entrada);
  return prisma.paciente.findUnique({
    where: { cpf },
    select: { id: true, cpf: true, nome: true, telefone: true },
  });
}

export async function atualizar(id: string, entrada: unknown) {
  const { revisao, ...contato } = esquemaContato.parse(entrada);
  return prisma.$transaction(async (tx) => {
    const alteracao = await tx.paciente.updateMany({ where: { id, revisao }, data: { ...contato, revisao: { increment: 1 } } });
    if (!alteracao.count) {
      const existe = await tx.paciente.findUnique({ where: { id } });
      throw new ErroCadastro(existe ? 409 : 404, existe
        ? 'Cadastro alterado por outra pessoa. Recarregue antes de salvar.' : 'Paciente não encontrado');
    }
    const paciente = await tx.paciente.findUniqueOrThrow({ where: { id } });
    await enfileirar(tx, paciente, `paciente-${id}`);
    return paciente;
  });
}

export async function receberAgendamento(entrada: unknown) {
  const evento = esquemaPacienteAgendado.parse(entrada);
  await prisma.$transaction(async (tx) => {
    const registro = await tx.eventoProcessado.createMany({ data: { idEvento: evento.id_evento, tipo: evento.tipo }, skipDuplicates: true });
    if (!registro.count) return;
    const dados = evento.payload.paciente;
    // Não sobrescreve o contato mestre com uma cópia antiga de uma consulta.
    const paciente = await tx.paciente.upsert({ where: { cpf: dados.cpf }, create: dados, update: {} });
    // Também sincroniza uma nova consulta de paciente já cadastrado.
    await enfileirar(tx, paciente, evento.id_correlacao);
  });
}
