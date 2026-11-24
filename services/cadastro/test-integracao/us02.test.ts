import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { criarApp } from '../src/app';
import { prisma } from '../src/db';
import { receberAgendamento } from '../src/servico';

if (process.env.TEST_US02_DB !== '1') throw new Error('Use um banco isolado e defina TEST_US02_DB=1.');

test('US-02: contrato HTTP do cadastro mestre', async (t) => {
  const prefixo = String(randomInt(1_000_000)).padStart(6, '0');
  const cpf = `000${prefixo}01`;
  const cpfOcupado = `000${prefixo}02`;
  const cpfAusente = `000${prefixo}03`;
  const sufixo = randomUUID();
  const nome = `Paciente Fictício US02 ${sufixo}`;
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
    return { status: resposta.status, cache: resposta.headers.get('cache-control'), dados: await resposta.json() };
  }
  const buscar = (cpf: string) => api('/busca-cpf', 'POST', { cpf });
  const mascara = (v: string) => v.replace(/^(...)(...)(...)(..)$/, '$1.$2.$3-$4');
  const eventos: string[] = [];
  let id: string | undefined;
  try {
    for (const documento of [cpf, cpfOcupado]) {
      const evento = randomUUID();
      eventos.push(evento);
      await receberAgendamento({
        id_evento: evento, tipo: 'consulta.agendada', versao: 1, origem: 'agendamento',
        ocorrido_em: new Date().toISOString(), id_correlacao: `consulta-${evento}`,
        payload: { id_consulta: evento, paciente: { cpf: documento, nome, telefone: '81900000001' } },
      });
    }
    const encontrado = await buscar(cpf);
    assert.equal(encontrado.status, 200);
    id = encontrado.dados.paciente.id;
    assert.ok(id);
    const rota = `/${id}`;
    const editar = (dados: unknown) => api(rota, 'PATCH', dados);

    await t.test('CA1: CPF com ou sem máscara encontra o mesmo ID e ausente não cria', async () => {
      assert.equal(encontrado.cache, 'no-store');
      assert.deepEqual(await buscar(mascara(cpf)), encontrado);
      assert.deepEqual(await buscar(cpfAusente), { status: 200, cache: 'no-store', dados: { paciente: null } });
      assert.equal(await prisma.paciente.count({ where: { cpf: cpfAusente } }), 0);
      assert.equal((await buscar('123')).status, 400);
    });

    await t.test('CA2: grava e limpa campos opcionais; rejeita colisão sem alterar o cadastro', async () => {
      const inicial = (await api(rota)).dados;
      assert.equal(inicial.nascimento, null);
      const salvo = await editar({
        cpf: mascara(cpf), revisao: inicial.revisao, nascimento: '2000-02-29',
        convenio: '  Convênio fictício  ', telefone: '(81) 90000-0002', email: ' us02@example.invalid ',
      });
      assert.equal(salvo.status, 200);
      assert.deepEqual(salvo.dados, {
        ...inicial, telefone: '81900000002', email: 'us02@example.invalid', nascimento: '2000-02-29',
        convenio: 'Convênio fictício', revisao: inicial.revisao + 1,
      });
      const revisao = salvo.dados.revisao;
      const conflito = await editar({ cpf: mascara(cpfOcupado), revisao, telefone: '81900000003' });
      assert.deepEqual(conflito, { status: 409, cache: 'no-store', dados: { erro: 'CPF já pertence a outro paciente.' } });
      assert.equal((await editar({ cpf: cpfAusente, revisao })).status, 400);
      assert.equal((await editar({ nascimento: '2000-02-30', revisao })).status, 400);
      assert.equal((await editar({ email: null, revisao: inicial.revisao })).status, 409);
      assert.deepEqual((await api(rota)).dados, salvo.dados);
      const limpo = await editar({ convenio: null, nascimento: null, revisao });
      assert.equal(limpo.status, 200);
      assert.deepEqual(limpo.dados, { ...salvo.dados, convenio: null, nascimento: null, revisao: revisao + 1 });
    });

    await t.test('CA3: páginas têm ordem estável, total e só os campos da lista', async () => {
      const query = `?busca=${encodeURIComponent(sufixo)}&tamanhoPagina=1`;
      const primeira = await api(query);
      const segunda = await api(`${query}&pagina=2`);
      assert.equal(primeira.status, 200);
      assert.equal(segunda.status, 200);
      assert.equal(primeira.cache, 'no-store');
      assert.equal(primeira.dados.totalFiltrado, 2);
      assert.equal(primeira.dados.total, segunda.dados.total);
      assert.ok(primeira.dados.total >= 2);
      assert.equal(primeira.dados.pacientes.length, 1);
      assert.equal(segunda.dados.pacientes.length, 1);
      assert.notEqual(primeira.dados.pacientes[0].id, segunda.dados.pacientes[0].id);
      assert.deepEqual(Object.keys(primeira.dados.pacientes[0]).sort(), ['cpf', 'email', 'id', 'nome', 'revisao', 'telefone']);
      const invalida = await api('?tamanhoPagina=101');
      assert.deepEqual(invalida, { status: 400, cache: 'no-store', dados: { erro: 'Dados de cadastro ou busca inválidos. Confira os campos.' } });
      assert.equal((await api('/inexistente')).status, 404);
    });
  } finally {
    try {
      await new Promise<void>((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
      const correlacoes = [...eventos.map((evento) => `consulta-${evento}`), ...(id ? [`paciente-${id}`] : [])];
      await prisma.eventoSaida.deleteMany({ where: { OR: correlacoes.map((correlacao) => ({
        envelope: { path: ['id_correlacao'], equals: correlacao },
      })) } });
      await prisma.eventoProcessado.deleteMany({ where: { idEvento: { in: eventos } } });
      await prisma.paciente.deleteMany({ where: { cpf: { in: [cpf, cpfOcupado] } } });
    } finally { await prisma.$disconnect(); }
  }
});
