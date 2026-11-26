// US-09 ponta a ponta: consultas criadas pela API viram lembretes na listagem dedicada da recepção.
// Uso: Compose ativo (CANAL_ENVIO=log); TEST_BASE_URL aponta o gateway (padrão http://localhost:8080).
import { fetch } from './http-autenticado.mjs';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const CPF = `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
const TELEFONE = `8190000${String(randomInt(10_000)).padStart(4, '0')}`;

async function api(rota, { method = 'GET', body } = {}) {
  const resposta = await fetch(`${base}/api/${rota}`, {
    method,
    signal: AbortSignal.timeout(8000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => null) };
}

async function aguardar(carregar, condicao, descricao) {
  const limite = Date.now() + 45_000;
  while (Date.now() < limite) {
    const dado = await carregar().catch(() => undefined);
    if (dado !== undefined && condicao(dado)) return dado;
    await esperar(500);
  }
  throw new Error(`Tempo esgotado: ${descricao}`);
}

// Dia distante (40 dias) em Recife: o lembrete fica programado e não é enviado durante o teste.
const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(new Date(Date.now() + 40 * 86_400_000));

async function agendar(hora) {
  const r = await api('agendamento/consultas', {
    method: 'POST',
    body: { nome: 'Paciente Exemplo Nove', cpf: CPF, telefone: TELEFONE, profissional: 'Dra. Exemplo', especialidade: 'Teste', inicio: `${DIA}T${hora}:00-03:00` },
  });
  assert.equal(r.status, 201);
  return r.dados.id;
}

const painel = async (query) => (await api(`notificacao/lembretes/painel?${query}`)).dados;

before(async () => {
  await aguardar(async () => (await api('notificacao/saude')).status, (s) => s === 200, 'Notificação pelo gateway');
});

test('US-09 CA1 e CA2: a listagem traz os lembretes do período, filtra por situação e não expõe CPF nem telefone', { timeout: 120_000 }, async () => {
  const manha = await agendar('09:00');
  const tarde = await agendar('15:00');
  await aguardar(() => painel(`de=${DIA}&ate=${DIA}&tamanhoPagina=100`),
    (p) => [manha, tarde].every((id) => p.itens.some((l) => l.idConsulta === id)), 'lembretes no painel');
  assert.equal((await api(`agendamento/consultas/${tarde}`, { method: 'DELETE' })).status, 200);
  await aguardar(() => painel(`de=${DIA}&ate=${DIA}&situacao=cancelado&tamanhoPagina=100`),
    (p) => p.itens.some((l) => l.idConsulta === tarde), 'cancelamento refletido no painel');

  const programados = await painel(`de=${DIA}&ate=${DIA}&situacao=programado&tamanhoPagina=100`);
  assert.ok(programados.itens.some((l) => l.idConsulta === manha));
  assert.ok(!programados.itens.some((l) => l.idConsulta === tarde));
  assert.ok(programados.itens.every((l) => l.status === 'programado'));
  assert.ok(programados.contagem.cancelado >= 1 && programados.contagem.programado >= 1);

  const doTeste = programados.itens.find((l) => l.idConsulta === manha);
  assert.equal(doTeste.pacienteNome, 'Paciente Exemplo Nove');
  assert.equal(doTeste.profissional, 'Dra. Exemplo');
  assert.equal(new Date(doTeste.inicioConsulta).toISOString(), new Date(`${DIA}T09:00:00-03:00`).toISOString());
  const texto = JSON.stringify(programados);
  assert.ok(!texto.includes(CPF) && !texto.includes(TELEFONE), 'painel sem CPF nem telefone');
});

test('US-09 CA2: filtro inválido responde 400 pelo gateway, com motivo', async () => {
  const r = await api('notificacao/lembretes/painel?situacao=qualquer');
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /Situação inválida/);
});
