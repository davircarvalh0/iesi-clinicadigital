import { fetch, profissionalDeTeste } from './http-autenticado.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import { promisify } from 'node:util';
// A mesma regra que a tela usa para mostrar "Sincronização pendente" (Node remove os tipos ao importar).
import { pendenciaDe as pendenciaDoLembrete } from '../apps/recepcao/src/dominio/lembretes.ts';

// Requer o Compose no ar. Pausa o consumo da Notificação e para o container dela por alguns segundos.
const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const projeto = process.env.COMPOSE_PROJECT_NAME ?? 'iesi-clinicadigital-teste';
const executar = promisify(execFile);

async function api(rota, { method = 'GET', body } = {}) {
  const resposta = await fetch(`${base}/api/${rota}`, {
    method,
    signal: AbortSignal.timeout(8000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => null) };
}

async function aguardar(carregar, condicao, descricao, limiteMs = 45000) {
  const limite = Date.now() + limiteMs;
  while (Date.now() < limite) {
    const dado = await carregar().catch(() => undefined);
    if (dado !== undefined && condicao(dado)) return dado;
    await esperar(400);
  }
  throw new Error(`Tempo esgotado: ${descricao}`);
}

const saudeOk = () => Promise.all(['agendamento', 'notificacao'].map(async (s) => (await api(`${s}/saude`)).status));
const definirConsumo = (ativo) => api('notificacao/demo/consumo', { method: 'PUT', body: { ativo } });
const compose = (...args) => executar('docker', ['compose', '-p', projeto, ...args]);

before(async () => {
  await aguardar(saudeOk, (r) => r.every((s) => s === 200), 'APIs prontas pelo gateway');
});

// Deixa o ambiente como estava mesmo se um teste falhar no meio.
after(async () => {
  await compose('start', 'notificacao').catch(() => {});
  await aguardar(saudeOk, (r) => r.every((s) => s === 200), 'Notificação de volta', 60000).catch(() => {});
  await definirConsumo(true).catch(() => {});
});

const emDias = (d) => new Date(Date.now() + d * 86400_000).toISOString();

async function agendar(inicio) {
  const r = await api('agendamento/consultas', {
    method: 'POST',
    body: {
      cpf: `000${String(randomInt(100_000_000)).padStart(8, '0')}`, nome: 'Paciente Fictício US18', telefone: '81900000180',
      profissional: profissionalDeTeste(), especialidade: 'Teste', inicio,
    },
  });
  assert.equal(r.status, 201);
  return r.dados;
}

async function consulta(id) {
  const r = await api('agendamento/consultas');
  assert.equal(r.status, 200);
  return r.dados.find((c) => c.id === id);
}

async function estado(id) {
  const [c, l] = await Promise.all([consulta(id), api(`notificacao/lembretes?consulta=${id}`)]);
  assert.equal(l.status, 200);
  const lembrete = l.dados[0];
  return { consulta: c, lembrete, pendencia: pendenciaDoLembrete(c, lembrete) };
}

test('CA1: cancelamento recusado responde erro com motivo; repetir um cancelamento feito responde 409', async () => {
  const inexistente = await api(`agendamento/consultas/${randomUUID()}`, { method: 'DELETE' });
  assert.equal(inexistente.status, 404);
  assert.equal(inexistente.dados.erro, 'Consulta não encontrada');

  const { id } = await agendar(emDias(40));
  assert.equal((await api(`agendamento/consultas/${id}`, { method: 'DELETE' })).status, 200);
  // Base para a tela tratar um cancelamento repetido (após resultado incerto) como já cancelado.
  const repetido = await api(`agendamento/consultas/${id}`, { method: 'DELETE' });
  assert.equal(repetido.status, 409);
  assert.equal(repetido.dados.erro, 'Consulta já cancelada');
});

test('CA3: com consumo atrasado, remarcação e cancelamento ficam pendentes e se resolvem quando o resultado chega', async () => {
  const agendada = await agendar(emDias(30));
  let atual = await aguardar(() => estado(agendada.id), (e) => e.lembrete?.status === 'programado', 'lembrete programado');
  assert.equal(atual.pendencia, null);

  assert.equal((await definirConsumo(false)).status, 200);
  try {
    const novoInicio = emDias(31);
    assert.equal((await api(`agendamento/consultas/${agendada.id}`, { method: 'PATCH', body: { inicio: novoInicio } })).status, 200);
    atual = await estado(agendada.id);
    assert.equal(atual.pendencia, 'remarcacao', 'Notificação ainda com o horário anterior');

    assert.equal((await api(`agendamento/consultas/${agendada.id}`, { method: 'DELETE' })).status, 200);
    await esperar(3000);
    atual = await estado(agendada.id);
    assert.equal(atual.consulta.status, 'cancelada');
    assert.equal(atual.lembrete.status, 'programado', 'nada é confirmado antes do consumo');
    assert.equal(atual.pendencia, 'cancelamento');
  } finally {
    assert.equal((await definirConsumo(true)).status, 200);
  }

  atual = await aguardar(() => estado(agendada.id), (e) => e.pendencia === null, 'pendência resolvida após retomar o consumo');
  assert.equal(atual.lembrete.status, 'cancelado');
});

test('CA2: Notificação parada não derruba a agenda; lembretes ficam inacessíveis e se recuperam ao voltar', async () => {
  await compose('stop', 'notificacao');
  try {
    // Com o container parado, o gateway pode responder 5xx ou segurar a conexão (resolução DNS do nginx).
    // A tela aborta em 8 s (TIMEOUT_PADRAO_MS) e mostra a Notificação como indisponível nos dois casos.
    const inicio = Date.now();
    const lembretes = await api('notificacao/lembretes').catch((e) => ({ status: e.name }));
    assert.ok([502, 503, 504, 'TimeoutError'].includes(lembretes.status), `sem resposta boa (veio ${lembretes.status})`);
    assert.ok(Date.now() - inicio < 9000, 'falha percebida dentro do prazo da tela');
    assert.equal((await api('agendamento/consultas')).status, 200, 'Agendamento segue disponível');

    // Alterações gravadas enquanto a Notificação está fora ficam pendentes no barramento.
    const { id } = await agendar(emDias(35));
    assert.equal((await api(`agendamento/consultas/${id}`, { method: 'DELETE' })).status, 200);
    await compose('start', 'notificacao');
    await aguardar(saudeOk, (r) => r.every((s) => s === 200), 'Notificação de volta', 60000);

    const final = await aguardar(() => estado(id), (e) => e.lembrete?.status === 'cancelado', 'eventos processados após a volta');
    assert.equal(final.pendencia, null);
  } finally {
    await compose('start', 'notificacao').catch(() => {});
  }
});
