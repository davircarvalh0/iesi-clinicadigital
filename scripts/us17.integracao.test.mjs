import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';

async function api(rota, { method = 'GET', body, bruto } = {}) {
  const corpo = bruto ?? (body === undefined ? undefined : JSON.stringify(body));
  const resposta = await fetch(`${base}/api/${rota}`, {
    method,
    signal: AbortSignal.timeout(6000),
    ...(corpo === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: corpo }),
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => null) };
}

async function aguardar(carregar, condicao, descricao) {
  const limite = Date.now() + 30000;
  while (Date.now() < limite) {
    const dado = await carregar();
    if (condicao(dado)) return dado;
    await esperar(250);
  }
  throw new Error(`Tempo esgotado: ${descricao}`);
}

before(async () => {
  await aguardar(
    async () => {
      try {
        return (await api('agendamento/saude')).status;
      } catch {
        return 0;
      }
    },
    (status) => status === 200,
    'Agendamento pronto pelo gateway',
  );
});

const cpfFicticio = () => `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
const inicioFuturo = () => new Date(Date.now() + 7 * 86400000).toISOString();

const consultaValida = () => ({
  nome: 'Paciente Fictício US17', cpf: cpfFicticio(), telefone: '81900000017',
  profissional: 'Profissional Fictício', especialidade: 'Teste', inicio: inicioFuturo(),
});

// Retrato do que o Agendamento persistiu: consultas e linhas da outbox.
async function retrato() {
  const consultas = (await api('agendamento/consultas')).dados.map((c) => c.id).sort();
  const eventos = (await api('agendamento/eventos?limite=100')).dados.map((e) => e.id).sort();
  return { consultas, eventos };
}

test('US-17 CA1: entrada inválida responde 400 com mensagem e não cria consulta nem outbox', async () => {
  const antes = await retrato();
  const invalidas = [
    ['CPF com letras', { ...consultaValida(), cpf: 'abc12345678901' }, /CPF inválido/],
    ['CPF curto', { ...consultaValida(), cpf: '123' }, /CPF inválido/],
    ['telefone inválido', { ...consultaValida(), telefone: '123' }, /Telefone inválido/],
    ['telefone zerado', { ...consultaValida(), telefone: '00000000000' }, /Telefone inválido/],
    ['data inexistente', { ...consultaValida(), inicio: '2026-02-30T10:00:00-03:00' }, /Data e hora inválidas/],
    ['data sem fuso', { ...consultaValida(), inicio: '2026-12-01T10:00:00' }, /Data e hora inválidas/],
    ['nome curto', { ...consultaValida(), nome: 'Al' }, /Nome/],
  ];
  for (const [descricao, corpo, mensagem] of invalidas) {
    const { status, dados } = await api('agendamento/consultas', { method: 'POST', body: corpo });
    assert.equal(status, 400, descricao);
    assert.match(dados.erro, mensagem, descricao);
  }
  const json = await api('agendamento/consultas', { method: 'POST', bruto: '{"nome": ' });
  assert.equal(json.status, 400, 'JSON malformado');
  assert.equal(json.dados.erro, 'JSON inválido');

  assert.deepEqual(await retrato(), antes, 'nenhuma consulta nem evento de outbox foi criado');
});

test('US-17 CA1: remarcação com data inválida responde 400 e não altera a consulta nem a outbox', async () => {
  const criada = await api('agendamento/consultas', { method: 'POST', body: consultaValida() });
  assert.equal(criada.status, 201);
  const antes = await retrato();

  const { status, dados } = await api(`agendamento/consultas/${criada.dados.id}`, { method: 'PATCH', body: { inicio: 'ontem' } });
  assert.equal(status, 400);
  assert.match(dados.erro, /Data e hora inválidas/);

  assert.deepEqual(await retrato(), antes);
  const atual = (await api('agendamento/consultas')).dados.find((c) => c.id === criada.dados.id);
  assert.equal(atual.inicio, criada.dados.inicio);
});

test('US-17 CA2: consulta inexistente responde 404 e consulta cancelada responde 409', async () => {
  const inexistente = randomUUID();
  const remarcar = await api(`agendamento/consultas/${inexistente}`, { method: 'PATCH', body: { inicio: inicioFuturo() } });
  assert.equal(remarcar.status, 404);
  assert.equal(remarcar.dados.erro, 'Consulta não encontrada');
  assert.equal((await api(`agendamento/consultas/${inexistente}`, { method: 'DELETE' })).status, 404);

  const criada = await api('agendamento/consultas', { method: 'POST', body: consultaValida() });
  assert.equal(criada.status, 201);
  assert.equal((await api(`agendamento/consultas/${criada.dados.id}`, { method: 'DELETE' })).status, 200);

  const antes = await retrato();
  const cancelarDeNovo = await api(`agendamento/consultas/${criada.dados.id}`, { method: 'DELETE' });
  assert.equal(cancelarDeNovo.status, 409);
  assert.equal(cancelarDeNovo.dados.erro, 'Consulta já cancelada');
  const remarcarCancelada = await api(`agendamento/consultas/${criada.dados.id}`, { method: 'PATCH', body: { inicio: inicioFuturo() } });
  assert.equal(remarcarCancelada.status, 409);
  assert.deepEqual(await retrato(), antes, 'rejeições 404 e 409 não geram eventos');
});

test('US-17 CA3: limite negativo, zero ou não numérico é rejeitado; limite alto é reduzido a 100', async () => {
  for (const rota of ['agendamento/eventos', 'notificacao/atividades']) {
    for (const limite of ['-5', '0', '1.5', 'abc']) {
      const { status, dados } = await api(`${rota}?limite=${limite}`);
      assert.equal(status, 400, `${rota}?limite=${limite}`);
      assert.match(dados.erro, /Limite inválido/);
    }
    const alto = await api(`${rota}?limite=5000`);
    assert.equal(alto.status, 200);
    assert.ok(alto.dados.length <= 100);
    const padrao = await api(rota);
    assert.equal(padrao.status, 200);
    assert.ok(padrao.dados.length <= 30);
  }
});
