import { CANAIS_CONTATO, criarEnvelope, isoRecife } from '@clinica/eventos';
import { Prisma, type AutorizacaoContato, type Paciente } from '../generated/prisma';
import { prisma } from './db';
import { esquemaAutorizacao, esquemaBusca, esquemaBuscaCpf, esquemaContato, esquemaPacienteAgendado } from './validacao';

export class ErroCadastro extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem); }
}

const camposLista = {
  id: true, cpf: true, nome: true, telefone: true, email: true, revisao: true,
} as const;

const camposDetalhe = { ...camposLista, nascimento: true, convenio: true, canalPreferido: true } as const;
type PacienteDetalhe = Prisma.PacienteGetPayload<{ select: typeof camposDetalhe }>;
type Leitor = Prisma.TransactionClient | typeof prisma;

async function apresentarDetalhe(db: Leitor, p: PacienteDetalhe) {
  const { id, cpf, nome, telefone, email, revisao, nascimento, convenio, canalPreferido } = p;
  return {
    id, cpf, nome, telefone, email, revisao, nascimento: nascimento?.toISOString().slice(0, 10) ?? null, convenio,
    canalPreferido, autorizacoes: await situacaoAutorizacoes(db, id),
  };
}

function apresentarAutorizacao(a: AutorizacaoContato) {
  return { canal: a.canal, situacao: a.situacao, origem: a.origem, registradoEm: a.registradoEm.toISOString(), versao: a.versao };
}

/** Situação atual de cada canal: o registro de maior versão. Sem registro não é autorização. */
async function situacaoAutorizacoes(db: Leitor, idPaciente: string) {
  const registros = await db.autorizacaoContato.findMany({
    where: { idPaciente }, orderBy: [{ canal: 'asc' }, { versao: 'desc' }], distinct: ['canal'],
  });
  return CANAIS_CONTATO.map((canal) => {
    const atual = registros.find((r) => r.canal === canal);
    return atual ? apresentarAutorizacao(atual)
      : { canal, situacao: 'sem_registro' as const, origem: null, registradoEm: null, versao: 0 };
  });
}

/** Publica `paciente.atualizado` pela outbox (também usado ao abrir a conta do portal, US-27). */
export async function enfileirar(tx: Prisma.TransactionClient, paciente: Paciente, correlacao: string) {
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
    prisma.paciente.findMany({ where, select: camposLista, orderBy: [{ nome: 'asc' }, { id: 'asc' }], skip: (pagina - 1) * tamanhoPagina, take: tamanhoPagina }),
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

export async function detalhar(id: string) {
  const paciente = await prisma.paciente.findUnique({ where: { id }, select: camposDetalhe });
  if (!paciente) throw new ErroCadastro(404, 'Paciente não encontrado');
  return apresentarDetalhe(prisma, paciente);
}

export async function atualizar(id: string, entrada: unknown) {
  const { revisao, cpf, ...contato } = esquemaContato.parse(entrada);
  return prisma.$transaction(async (tx) => {
    if (cpf !== undefined) {
      const atual = await tx.paciente.findUnique({ where: { id } });
      if (!atual) throw new ErroCadastro(404, 'Paciente não encontrado');
      if (atual.cpf !== cpf) {
        const titular = await tx.paciente.findUnique({ where: { cpf }, select: { id: true } });
        if (titular) throw new ErroCadastro(409, 'CPF já pertence a outro paciente.');
        throw new ErroCadastro(400, 'O CPF do cadastro mestre não pode ser alterado.');
      }
      if (Object.keys(contato).length === 0) {
        if (atual.revisao !== revisao) throw erroDeRevisao();
        return apresentarDetalhe(tx, atual);
      }
    }
    const alteracao = await tx.paciente.updateMany({ where: { id, revisao }, data: { ...contato, revisao: { increment: 1 } } });
    if (!alteracao.count) {
      const existe = await tx.paciente.findUnique({ where: { id } });
      throw existe ? erroDeRevisao() : new ErroCadastro(404, 'Paciente não encontrado');
    }
    const paciente = await tx.paciente.findUniqueOrThrow({ where: { id } });
    await enfileirar(tx, paciente, `paciente-${id}`);
    return apresentarDetalhe(tx, paciente);
  });
}

/**
 * Registra uma autorização ou revogação e publica `paciente.autorizacao_alterada` v1 pela outbox,
 * na mesma transação. A versão cresce por paciente e canal; o índice único arbitra registros simultâneos.
 */
export async function registrarAutorizacao(id: string, entrada: unknown) {
  const { canal, situacao, origem } = esquemaAutorizacao.parse(entrada);
  try {
    return await prisma.$transaction(async (tx) => {
      const paciente = await tx.paciente.findUnique({ where: { id }, select: { id: true, cpf: true } });
      if (!paciente) throw new ErroCadastro(404, 'Paciente não encontrado');
      const ultima = await tx.autorizacaoContato.findFirst({ where: { idPaciente: id, canal }, orderBy: { versao: 'desc' } });
      const registro = await tx.autorizacaoContato.create({
        data: { idPaciente: id, canal, situacao, origem, versao: (ultima?.versao ?? 0) + 1 },
      });
      const evento = criarEnvelope({
        tipo: 'paciente.autorizacao_alterada', origem: 'cadastro', id_correlacao: `paciente-${id}`,
        payload: {
          id_paciente: id, cpf: paciente.cpf, canal, situacao, origem_registro: origem,
          registrado_em: isoRecife(registro.registradoEm), versao: registro.versao,
        },
      });
      await tx.eventoSaida.create({ data: {
        idEvento: evento.id_evento, tipo: evento.tipo, envelope: evento as unknown as Prisma.InputJsonValue,
      } });
      return { registro: apresentarAutorizacao(registro), autorizacoes: await situacaoAutorizacoes(tx, id) };
    });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroCadastro(409, 'Autorização registrada por outra pessoa ao mesmo tempo. Recarregue e tente de novo.');
    }
    throw erro;
  }
}

/** Histórico completo de um paciente, do registro mais recente para o mais antigo. */
export async function historicoAutorizacoes(id: string) {
  const paciente = await prisma.paciente.findUnique({ where: { id }, select: { id: true } });
  if (!paciente) throw new ErroCadastro(404, 'Paciente não encontrado');
  const registros = await prisma.autorizacaoContato.findMany({ where: { idPaciente: id }, orderBy: [{ registradoEm: 'desc' }, { versao: 'desc' }] });
  return { historico: registros.map(apresentarAutorizacao) };
}

function erroDeRevisao() {
  return new ErroCadastro(409, 'Cadastro alterado por outra pessoa. Recarregue antes de salvar.');
}

export async function receberAgendamento(entrada: unknown) {
  const evento = esquemaPacienteAgendado.parse(entrada);
  await prisma.$transaction(async (tx) => {
    const registro = await tx.eventoProcessado.createMany({ data: { idEvento: evento.id_evento, tipo: evento.tipo }, skipDuplicates: true });
    if (!registro.count) return;
    const dados = evento.payload.paciente;
    // O índice único arbitra criações concorrentes (INSERT ... ON CONFLICT DO NOTHING).
    // A leitura seguinte recupera o vencedor sem sobrescrever o contato mestre.
    await tx.paciente.createMany({ data: dados, skipDuplicates: true });
    const paciente = await tx.paciente.findUniqueOrThrow({ where: { cpf: dados.cpf } });
    // Também sincroniza uma nova consulta de paciente já cadastrado.
    await enfileirar(tx, paciente, evento.id_correlacao);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
