// US-13 ponta a ponta: consulta próxima com autorização → envio simulado → trilha com a tentativa e as atividades.
// Uso: Compose ativo com CANAL_ENVIO=log e antecedência padrão; TEST_BASE_URL aponta o gateway.
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const CPF = `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
const TELEFONE = `8190000${String(randomInt(10_000)).padStart(4, '0')}`;
const NOME = `Paciente Exemplo Treze ${randomInt(1000, 9999)}`;

async function api(rota, { method = 'GET', body } = {}) {
  const resposta = await fetch(`${base}/api/${rota}`, {
    method,
    signal: AbortSignal.timeout(8000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => null) };
}

async function aguardar(carregar, condicao, descricao, prazo = 45_000) {
  const limite = Date.now() + prazo;
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

test('US-13: a trilha mostra a programação, a tentativa simulada e o resultado, sem dados pessoais', { timeout: 120_000 }, async () => {
  // Consulta futura distante: cria o paciente no Cadastro sem disparar envio.
  const primeira = await api('agendamento/consultas', {
    method: 'POST',
    body: { nome: NOME, cpf: CPF, telefone: TELEFONE, profissional: 'Dra. Exemplo', especialidade: 'Teste', inicio: new Date(Date.now() + 30 * 86_400_000).toISOString() },
  });
  assert.equal(primeira.status, 201);
  const { dados: busca } = await aguardar(() => api('cadastro/pacientes/busca-cpf', { method: 'POST', body: { cpf: CPF } }),
    (r) => !!r.dados?.paciente, 'paciente no Cadastro');
  const idPaciente = busca.paciente.id;
  assert.equal((await api(`cadastro/pacientes/${idPaciente}/autorizacoes`, {
    method: 'POST', body: { canal: 'whatsapp', situacao: 'autorizado', origem: 'presencial' },
  })).status, 201);
  await aguardar(async () => (await api(`notificacao/autorizacoes/${idPaciente}`)).dados,
    (c) => c?.autorizacoes?.some((a) => a.canal === 'whatsapp' && a.situacao === 'autorizado'), 'cópia da autorização');

  // Consulta em 1 hora: com antecedência de 24 h, o lembrete sai no próximo ciclo.
  const proxima = await api('agendamento/consultas', {
    method: 'POST',
    body: { nome: NOME, cpf: CPF, telefone: TELEFONE, profissional: 'Dra. Exemplo', especialidade: 'Teste', inicio: new Date(Date.now() + 3_600_000).toISOString() },
  });
  assert.equal(proxima.status, 201);
  const id = proxima.dados.id;

  const trilha = await aguardar(async () => (await api(`notificacao/lembretes/${id}/trilha`)).dados,
    (t) => t?.lembrete?.status === 'simulado' && t.atividades.some((a) => a.acao === 'lembrete.simulado'), 'envio simulado na trilha');
  assert.equal(trilha.tentativas.length, 1);
  const [tentativa] = trilha.tentativas;
  assert.equal(tentativa.numero, 1);
  assert.equal(tentativa.resultado, 'simulado');
  assert.equal(tentativa.modo, 'simulado');
  assert.equal(tentativa.canal, 'log');
  assert.ok(tentativa.concluidaEm);
  assert.equal(tentativa.idEventoConsulta, trilha.lembrete.idEventoConsulta);
  const acoes = trilha.atividades.map((a) => a.acao);
  assert.ok(acoes.indexOf('lembrete.programado') < acoes.indexOf('lembrete.simulado'));
  const texto = JSON.stringify(trilha);
  for (const pessoal of [CPF, TELEFONE, NOME]) assert.ok(!texto.includes(pessoal), 'trilha sem dados pessoais');

  // A remarcação zera o resultado do lembrete, mas a tentativa anterior continua na trilha.
  assert.equal((await api(`agendamento/consultas/${id}`, { method: 'PATCH', body: { inicio: new Date(Date.now() + 10 * 86_400_000).toISOString() } })).status, 200);
  const remarcada = await aguardar(async () => (await api(`notificacao/lembretes/${id}/trilha`)).dados,
    (t) => t?.lembrete?.status === 'programado', 'remarcação na trilha');
  assert.equal(remarcada.lembrete.tentativas, 0);
  assert.equal(remarcada.tentativas.length, 1);
  assert.ok(remarcada.atividades.some((a) => a.acao === 'lembrete.reprogramado'));
});

test('US-13: consulta sem lembrete e identificador inválido têm resposta própria', async () => {
  assert.equal((await api(`notificacao/lembretes/${crypto.randomUUID()}/trilha`)).status, 404);
  const invalido = await api('notificacao/lembretes/xyz/trilha');
  assert.equal(invalido.status, 400);
  assert.match(invalido.dados.erro, /Identificador de consulta inválido/);
});
