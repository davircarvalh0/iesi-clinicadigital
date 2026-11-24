import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { validarAutorizacaoContato } from '@clinica/eventos';
import { criarApp } from '../src/app';
import { prisma } from '../src/db';
import { receberAgendamento } from '../src/servico';

if (process.env.TEST_US14_DB !== '1') throw new Error('Use um banco isolado e defina TEST_US14_DB=1.');

// Só dados fictícios.
test('US-14 CA1: o Cadastro registra canal, data, origem e versão; ausência não é autorização', async (t) => {
  const cpf = `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
  const idEvento = randomUUID();
  const servidor = criarApp().listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const endereco = servidor.address();
  assert.ok(endereco && typeof endereco !== 'string');
  const base = `http://127.0.0.1:${endereco.port}/pacientes`;
  async function api(rota: string, metodo = 'GET', corpo?: unknown) {
    const resposta = await fetch(`${base}${rota}`, {
      method: metodo, signal: AbortSignal.timeout(5000),
      ...(corpo === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }),
    });
    return { status: resposta.status, dados: await resposta.json() };
  }
  let id: string | undefined;
  try {
    await receberAgendamento({
      id_evento: idEvento, tipo: 'consulta.agendada', versao: 1, origem: 'agendamento',
      ocorrido_em: new Date().toISOString(), id_correlacao: `consulta-${idEvento}`,
      payload: { id_consulta: idEvento, paciente: { cpf, nome: 'Paciente Fictício US14', telefone: '81900000141' } },
    });
    id = (await prisma.paciente.findUniqueOrThrow({ where: { cpf } })).id;
    const rota = `/${id}`;

    await t.test('paciente sem registro não tem nenhum canal autorizado', async () => {
      const { dados } = await api(rota);
      assert.equal(dados.canalPreferido, null);
      assert.deepEqual(dados.autorizacoes.map((a: { canal: string; situacao: string; versao: number }) => [a.canal, a.situacao, a.versao]), [
        ['whatsapp', 'sem_registro', 0], ['sms', 'sem_registro', 0], ['email', 'sem_registro', 0],
      ]);
      assert.deepEqual((await api(`${rota}/autorizacoes`)).dados, { historico: [] });
    });

    await t.test('autorização e revogação ficam no histórico e publicam evento v1 pela outbox', async () => {
      const antes = Date.now();
      const autorizado = await api(`${rota}/autorizacoes`, 'POST', { canal: 'whatsapp', situacao: 'autorizado', origem: 'presencial' });
      assert.equal(autorizado.status, 201);
      assert.equal(autorizado.dados.registro.versao, 1);
      assert.equal(autorizado.dados.registro.origem, 'presencial');
      assert.ok(Date.parse(autorizado.dados.registro.registradoEm) >= antes - 1000);
      const revogado = await api(`${rota}/autorizacoes`, 'POST', { canal: 'whatsapp', situacao: 'revogado', origem: 'telefone' });
      assert.equal(revogado.status, 201);
      assert.deepEqual(
        revogado.dados.autorizacoes.find((a: { canal: string }) => a.canal === 'whatsapp'),
        revogado.dados.registro,
      );
      assert.equal(revogado.dados.registro.situacao, 'revogado');
      assert.equal(revogado.dados.registro.versao, 2);

      const detalhe = (await api(rota)).dados;
      assert.equal(detalhe.autorizacoes[0].situacao, 'revogado');
      assert.equal(detalhe.autorizacoes[1].situacao, 'sem_registro', 'autorizar WhatsApp não autoriza SMS');
      const { historico } = (await api(`${rota}/autorizacoes`)).dados;
      assert.deepEqual(historico.map((h: { situacao: string; versao: number }) => [h.situacao, h.versao]), [['revogado', 2], ['autorizado', 1]]);

      const saidas = await prisma.eventoSaida.findMany({
        where: { tipo: 'paciente.autorizacao_alterada', envelope: { path: ['id_correlacao'], equals: `paciente-${id}` } },
        orderBy: { criadoEm: 'asc' },
      });
      assert.equal(saidas.length, 2);
      const eventos = saidas.map((s) => validarAutorizacaoContato(s.envelope));
      for (const v of eventos) assert.equal(v.ok, true);
      const ultimo = (eventos[1] as { ok: true; evento: { payload: Record<string, unknown> } }).evento.payload;
      assert.deepEqual({ ...ultimo, registrado_em: undefined }, {
        id_paciente: id, cpf, canal: 'whatsapp', situacao: 'revogado', origem_registro: 'telefone', versao: 2, registrado_em: undefined,
      });
      assert.doesNotMatch(JSON.stringify(saidas.map((s) => s.envelope)), /81900000141|Paciente Fictício/, 'evento sem nome nem telefone');
    });

    await t.test('canal preferido é persistido e validado', async () => {
      const { revisao } = (await api(rota)).dados;
      const salvo = await api(rota, 'PATCH', { revisao, canalPreferido: 'email' });
      assert.equal(salvo.status, 200);
      assert.equal(salvo.dados.canalPreferido, 'email');
      assert.equal((await api(rota, 'PATCH', { revisao: revisao + 1, canalPreferido: 'pombo' })).status, 400);
    });

    await t.test('entradas inválidas são recusadas, inclusive registrar "sem registro"', async () => {
      for (const corpo of [
        { canal: 'pombo', situacao: 'autorizado', origem: 'presencial' },
        { canal: 'sms', situacao: 'sem_registro', origem: 'presencial' },
        { canal: 'sms', situacao: 'autorizado' },
        { canal: 'sms', situacao: 'autorizado', origem: 'presencial', versao: 9 },
      ]) assert.equal((await api(`${rota}/autorizacoes`, 'POST', corpo)).status, 400, JSON.stringify(corpo));
      const ausente = await api(`/${randomUUID()}/autorizacoes`, 'POST', { canal: 'sms', situacao: 'autorizado', origem: 'presencial' });
      assert.deepEqual(ausente, { status: 404, dados: { erro: 'Paciente não encontrado' } });
    });

    await t.test('registros simultâneos no mesmo canal não repetem versão', async () => {
      const respostas = await Promise.all(Array.from({ length: 6 }, (_, i) => api(`${rota}/autorizacoes`, 'POST', {
        canal: 'sms', situacao: i % 2 ? 'revogado' : 'autorizado', origem: 'formulario',
      })));
      assert.ok(respostas.every((r) => r.status === 201 || r.status === 409));
      const versoes = (await prisma.autorizacaoContato.findMany({ where: { idPaciente: id, canal: 'sms' }, orderBy: { versao: 'asc' } }))
        .map((r) => r.versao);
      assert.equal(versoes.length, respostas.filter((r) => r.status === 201).length);
      assert.deepEqual(versoes, versoes.map((_, i) => i + 1));
    });
  } finally {
    try {
      await new Promise<void>((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
      await prisma.eventoSaida.deleteMany({ where: { OR: [`consulta-${idEvento}`, `paciente-${id}`].map((correlacao) => ({
        envelope: { path: ['id_correlacao'], equals: correlacao },
      })) } });
      await prisma.eventoProcessado.deleteMany({ where: { idEvento } });
      if (id) await prisma.autorizacaoContato.deleteMany({ where: { idPaciente: id } });
      await prisma.paciente.deleteMany({ where: { cpf } });
    } finally { await prisma.$disconnect(); }
  }
});
