import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { prisma } from '../src/db';
import { receberAgendamento } from '../src/servico';

if (process.env.TEST_US01_DB !== '1') {
  throw new Error('Use um banco de Cadastro isolado e defina TEST_US01_DB=1.');
}

const cpfFicticio = () => `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
const evento = (cpf: string, telefone = '81900000001') => {
  const id = randomUUID();
  return {
    id_evento: id, tipo: 'consulta.agendada', versao: 1, origem: 'agendamento',
    ocorrido_em: new Date().toISOString(), id_correlacao: `consulta-${id}`,
    payload: { id_consulta: id, paciente: { cpf, nome: 'Paciente Fictício US01', telefone } },
  };
};

test('US-01: transação do Cadastro sobre PostgreSQL', async (t) => {
  const cpfs = new Set<string>();
  const entradas: ReturnType<typeof evento>[] = [];
  const registrar = (cpf: string, telefone?: string) => {
    const entrada = evento(cpf, telefone);
    entradas.push(entrada);
    return entrada;
  };
  const contarSaidas = (correlacao: string) => prisma.eventoSaida.count({
    where: { envelope: { path: ['id_correlacao'], equals: correlacao } },
  });
  try {
    await t.test('cria um mestre e reutiliza seu ID sem sobrescrever contato', async () => {
      const cpf = cpfFicticio();
      cpfs.add(cpf);
      const primeiro = registrar(cpf);
      await receberAgendamento(primeiro);
      const salvo = await prisma.paciente.findUniqueOrThrow({ where: { cpf } });
      const comMascara = cpf.replace(/^(...)(...)(...)(..)$/, '$1.$2.$3-$4');
      const segundo = registrar(comMascara, '81900000002');
      await receberAgendamento(segundo);
      assert.deepEqual(await prisma.paciente.findUniqueOrThrow({ where: { cpf } }), salvo);
      const saida = await prisma.eventoSaida.findFirstOrThrow({
        where: { envelope: { path: ['id_correlacao'], equals: segundo.id_correlacao } },
      });
      assert.ok(saida.envelope && typeof saida.envelope === 'object' && 'payload' in saida.envelope);
      const payload = saida.envelope.payload;
      assert.ok(payload && typeof payload === 'object' && 'id_paciente' in payload);
      assert.equal(payload.id_paciente, salvo.id);
    });

    await t.test('entregas concorrentes mantêm um mestre e uma saída por id_evento', async () => {
      const cpf = cpfFicticio();
      cpfs.add(cpf);
      const distintos = Array.from({ length: 6 }, () => registrar(cpf));
      await Promise.all(distintos.flatMap((entrada) => [receberAgendamento(entrada), receberAgendamento(entrada)]));
      assert.equal(await prisma.paciente.count({ where: { cpf } }), 1);
      assert.equal(await prisma.eventoProcessado.count({
        where: { idEvento: { in: distintos.map((entrada) => entrada.id_evento) } },
      }), distintos.length);
      for (const entrada of distintos) assert.equal(await contarSaidas(entrada.id_correlacao), 1);
    });

    await t.test('falha da escrita na outbox reverte mestre e marcador, e o retry funciona', async () => {
      const cpf = cpfFicticio();
      cpfs.add(cpf);
      const entrada = registrar(cpf);
      const restricao = `us01_${entrada.id_evento.replace(/-/g, '')}`;
      // Só rejeita a correlação fictícia deste teste e só existe no banco isolado.
      await prisma.$executeRawUnsafe(
        `ALTER TABLE eventos_saida ADD CONSTRAINT ${restricao} CHECK (envelope->>'id_correlacao' <> '${entrada.id_correlacao}') NOT VALID`,
      );
      try {
        await assert.rejects(receberAgendamento(entrada), new RegExp(restricao));
        assert.equal(await prisma.paciente.count({ where: { cpf } }), 0);
        assert.equal(await prisma.eventoProcessado.count({ where: { idEvento: entrada.id_evento } }), 0);
        assert.equal(await contarSaidas(entrada.id_correlacao), 0);
      } finally {
        await prisma.$executeRawUnsafe(`ALTER TABLE eventos_saida DROP CONSTRAINT ${restricao}`);
      }
      await receberAgendamento(entrada);
      assert.equal(await prisma.paciente.count({ where: { cpf } }), 1);
      assert.equal(await prisma.eventoProcessado.count({ where: { idEvento: entrada.id_evento } }), 1);
      assert.equal(await contarSaidas(entrada.id_correlacao), 1);
    });
  } finally {
    try {
      for (const entrada of entradas) {
        await prisma.eventoSaida.deleteMany({ where: { envelope: { path: ['id_correlacao'], equals: entrada.id_correlacao } } });
      }
      await prisma.eventoProcessado.deleteMany({ where: { idEvento: { in: entradas.map((entrada) => entrada.id_evento) } } });
      await prisma.paciente.deleteMany({ where: { cpf: { in: [...cpfs] } } });
    } finally { await prisma.$disconnect(); }
  }
});
