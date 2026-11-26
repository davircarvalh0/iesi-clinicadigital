// US-15 pelo gateway: modo de envio explícito e decisão sobre envio incerto protegida pelas regras.
// O resultado incerto em si é provocado nos testes de banco (services/notificacao/test/us15.test.ts),
// porque exige um provedor que não responde. Uso: Compose ativo com CANAL_ENVIO=log.
import { fetch } from './http-autenticado.mjs';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';

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

before(async () => {
  await aguardar(async () => (await api('notificacao/saude')).status, (s) => s === 200, 'Notificação pelo gateway');
});

test('US-15 CA1: a Notificação informa o modo de envio sem expor credenciais nem telefones', async () => {
  const { status, dados } = await api('notificacao/envio/configuracao');
  assert.equal(status, 200);
  assert.equal(dados.modo, 'simulado', 'o ambiente de teste usa CANAL_ENVIO=log');
  assert.equal(dados.canal, 'log');
  assert.match(dados.motivo, /CANAL_ENVIO=log/);
  assert.equal(dados.destinosPermitidos, null);
  for (const campo of ['token', 'phoneNumberId', 'whatsapp']) assert.ok(!(campo in dados), campo);
});

test('US-15 CA3: só um envio sem confirmação aceita decisão; entrada inválida é recusada com motivo', { timeout: 60_000 }, async () => {
  const cpf = `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
  const criada = await api('agendamento/consultas', {
    method: 'POST',
    body: { nome: 'Paciente Exemplo Quinze', cpf, telefone: '81900000150', profissional: 'Dra. Exemplo', especialidade: 'Teste', inicio: new Date(Date.now() + 20 * 86_400_000).toISOString() },
  });
  assert.equal(criada.status, 201);
  const id = criada.dados.id;
  await aguardar(async () => (await api(`notificacao/lembretes?consulta=${id}`)).dados, (l) => l?.[0]?.status === 'programado', 'lembrete programado');

  const semNome = await api(`notificacao/lembretes/${id}/resolucao`, { method: 'POST', body: { acao: 'reenviar' } });
  assert.equal(semNome.status, 400);
  assert.match(semNome.dados.erro, /Informe quem está decidindo/);
  const programado = await api(`notificacao/lembretes/${id}/resolucao`, { method: 'POST', body: { acao: 'reenviar', solicitante: 'Juliana' } });
  assert.equal(programado.status, 409);
  assert.match(programado.dados.erro, /Só um envio sem confirmação pode ser resolvido/);
  assert.equal((await api(`notificacao/lembretes/${crypto.randomUUID()}/resolucao`, { method: 'POST', body: { acao: 'reenviar', solicitante: 'Juliana' } })).status, 404);

  const painel = await api('notificacao/lembretes/painel?situacao=incerto');
  assert.equal(painel.status, 200, 'o filtro de situação aceita "incerto"');
  assert.equal(typeof painel.dados.contagem.incerto, 'number');
});
