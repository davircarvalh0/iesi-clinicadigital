import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { after, before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import amqp from 'amqplib';
import { criarEnvelope, FILA_NOTIFICACAO } from '@clinica/eventos';

// Requer Compose com CANAL_ENVIO=log e antecedência padrão (1440 min): consulta em 1h é enviada no próximo ciclo.
const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const rabbit = process.env.TEST_RABBITMQ_URL ?? 'amqp://clinica:clinica@localhost:5672';

async function api(rota, { method = 'GET', body } = {}) {
  const resposta = await fetch(`${base}/api/${rota}`, {
    method,
    signal: AbortSignal.timeout(6000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => null) };
}

async function aguardar(carregar, condicao, descricao, limiteMs = 45000) {
  const limite = Date.now() + limiteMs;
  while (Date.now() < limite) {
    const dado = await carregar();
    if (condicao(dado)) return dado;
    await esperar(400);
  }
  throw new Error(`Tempo esgotado: ${descricao}`);
}

before(async () => {
  await aguardar(
    () => Promise.all(['cadastro', 'agendamento', 'notificacao'].map(async (s) => {
      try { return (await api(`${s}/saude`)).status; } catch { return 0; }
    })),
    (r) => r.every((s) => s === 200),
    'APIs prontas pelo gateway',
  );
});

// Garante o consumo ligado mesmo se um teste falhar no meio da pausa.
after(async () => { await api('notificacao/demo/consumo', { method: 'PUT', body: { ativo: true } }).catch(() => {}); });

const cpfFicticio = () => `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
const emHoras = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const lembrete = async (idConsulta) => (await api(`notificacao/lembretes?consulta=${idConsulta}`)).dados?.[0];
const copia = async (id) => (await api(`notificacao/autorizacoes/${id}`)).dados?.autorizacoes ?? [];
const whatsapp = (lista) => lista.find((a) => a.canal === 'whatsapp');

async function agendar(cpf, inicio, nome = 'Paciente Fictício US14') {
  const r = await api('agendamento/consultas', {
    method: 'POST',
    body: { cpf, nome, telefone: '81900000140', profissional: 'Profissional Fictício', especialidade: 'Teste', inicio },
  });
  assert.equal(r.status, 201);
  return r.dados.id;
}

/** Cria o paciente mestre por uma consulta distante (que não dispara envio) e devolve o ID. */
async function novoPaciente() {
  const cpf = cpfFicticio();
  await agendar(cpf, emHoras(24 * 10));
  const { dados } = await aguardar(
    () => api('cadastro/pacientes/busca-cpf', { method: 'POST', body: { cpf } }),
    (r) => !!r.dados?.paciente, 'paciente no Cadastro',
  );
  return { cpf, id: dados.paciente.id };
}

async function registrar(id, canal, situacao, origem = 'presencial') {
  const r = await api(`cadastro/pacientes/${id}/autorizacoes`, { method: 'POST', body: { canal, situacao, origem } });
  assert.equal(r.status, 201);
  return r.dados.registro;
}

async function aguardarCopia(id, versao) {
  return aguardar(() => copia(id), (l) => whatsapp(l)?.versao === versao, `cópia da autorização na versão ${versao}`);
}

test('US-14 CA2 (autorizado): com autorização de WhatsApp o lembrete é enviado', { timeout: 120000 }, async () => {
  const { cpf, id } = await novoPaciente();
  await registrar(id, 'whatsapp', 'autorizado');
  await aguardarCopia(id, 1);
  const consulta = await agendar(cpf, emHoras(1));
  const l = await aguardar(() => lembrete(consulta), (x) => x?.status === 'enviado', 'lembrete enviado');
  assert.equal(l.motivoFalha, null);
});

test('US-14 CA2 (desconhecido): sem registro o envio é bloqueado, mesmo com outro canal autorizado', { timeout: 120000 }, async () => {
  const { cpf, id } = await novoPaciente();
  await registrar(id, 'sms', 'autorizado');
  await aguardar(() => copia(id), (l) => l.some((a) => a.canal === 'sms'), 'cópia do SMS');
  const consulta = await agendar(cpf, emHoras(1));
  const l = await aguardar(() => lembrete(consulta), (x) => x?.status === 'bloqueado', 'lembrete bloqueado');
  assert.match(l.motivoFalha, /sem autorização de contato por WhatsApp/);
  const { dados: atividades } = await api('notificacao/atividades?limite=100');
  assert.ok(atividades.some((a) => a.idConsulta === consulta && a.acao === 'lembrete.bloqueado'));
  assert.ok(!atividades.some((a) => a.idConsulta === consulta && a.acao === 'lembrete.enviado'));
});

test('US-14 CA2 (negado): recusa registrada como primeira decisão bloqueia o envio', { timeout: 120000 }, async () => {
  const { cpf, id } = await novoPaciente();
  const registro = await registrar(id, 'whatsapp', 'revogado', 'telefone');
  assert.equal(registro.versao, 1);
  await aguardarCopia(id, 1);
  const consulta = await agendar(cpf, emHoras(1));
  const l = await aguardar(() => lembrete(consulta), (x) => x?.status === 'bloqueado', 'lembrete bloqueado');
  assert.match(l.motivoFalha, /revogada/);
});

test('US-14 CA3 (revogado): revogação propagada antes do envio bloqueia; nova autorização libera', { timeout: 150000 }, async () => {
  const { cpf, id } = await novoPaciente();
  await registrar(id, 'whatsapp', 'autorizado');
  await aguardarCopia(id, 1);
  const consulta = await agendar(cpf, emHoras(24 * 7));
  await aguardar(() => lembrete(consulta), (x) => x?.status === 'programado', 'lembrete programado');

  await registrar(id, 'whatsapp', 'revogado', 'telefone');
  await aguardarCopia(id, 2);
  await aguardar(() => lembrete(consulta), (x) => x?.status === 'bloqueado', 'lembrete bloqueado pela revogação');

  // Remarcar para perto não fura o bloqueio: a rotina de envio confere a cópia de novo.
  assert.equal((await api(`agendamento/consultas/${consulta}`, { method: 'PATCH', body: { inicio: emHoras(1) } })).status, 200);
  await aguardar(
    async () => (await api('notificacao/atividades?limite=100')).dados,
    (lista) => lista.filter((a) => a.idConsulta === consulta && a.acao === 'lembrete.bloqueado').length >= 2,
    'bloqueio no momento do envio',
  );
  assert.equal((await lembrete(consulta)).status, 'bloqueado');

  // Entrega atrasada da autorização antiga (versão 1) e duplicada não desfaz a revogação.
  const antiga = criarEnvelope({
    tipo: 'paciente.autorizacao_alterada', origem: 'cadastro', id_correlacao: `paciente-${id}`,
    payload: { id_paciente: id, cpf, canal: 'whatsapp', situacao: 'autorizado', origem_registro: 'presencial', registrado_em: new Date(Date.now() - 60000).toISOString(), versao: 1 },
  });
  const conexao = await amqp.connect(rabbit);
  try {
    const canal = await conexao.createConfirmChannel();
    canal.sendToQueue(FILA_NOTIFICACAO, Buffer.from(JSON.stringify(antiga)), { persistent: true });
    canal.sendToQueue(FILA_NOTIFICACAO, Buffer.from(JSON.stringify(antiga)), { persistent: true });
    await canal.waitForConfirms();
    await aguardar(async () => (await canal.checkQueue(FILA_NOTIFICACAO)).messageCount, (n) => n === 0, 'fila consumida');
  } finally { await conexao.close(); }
  await esperar(1500);
  assert.equal(whatsapp(await copia(id)).situacao, 'revogado');
  assert.equal((await lembrete(consulta)).status, 'bloqueado');

  await registrar(id, 'whatsapp', 'autorizado', 'formulario');
  await aguardarCopia(id, 3);
  await aguardar(() => lembrete(consulta), (x) => x?.status === 'enviado', 'lembrete liberado e enviado');
});

test('US-14 CA3: inconsistência de sincronização é visível e converge quando a Notificação volta', { timeout: 120000 }, async () => {
  const { id } = await novoPaciente();
  await registrar(id, 'whatsapp', 'autorizado');
  await aguardarCopia(id, 1);

  assert.equal((await api('notificacao/demo/consumo', { method: 'PUT', body: { ativo: false } })).status, 200);
  try {
    await registrar(id, 'whatsapp', 'revogado', 'telefone');
    await esperar(3000);
    // É a comparação que a tela de Pacientes faz: Cadastro na versão 2, Notificação ainda na 1.
    const cadastro = whatsapp((await api(`cadastro/pacientes/${id}`)).dados.autorizacoes);
    const notificacao = whatsapp(await copia(id));
    assert.deepEqual([cadastro.versao, cadastro.situacao], [2, 'revogado']);
    assert.deepEqual([notificacao.versao, notificacao.situacao], [1, 'autorizado']);
  } finally {
    assert.equal((await api('notificacao/demo/consumo', { method: 'PUT', body: { ativo: true } })).status, 200);
  }
  const final = await aguardarCopia(id, 2);
  assert.equal(whatsapp(final).situacao, 'revogado');
});

test('US-14: atividades de autorização não carregam CPF nem telefone', { timeout: 60000 }, async () => {
  const { cpf, id } = await novoPaciente();
  await registrar(id, 'whatsapp', 'autorizado');
  await aguardarCopia(id, 1);
  const { dados } = await api('notificacao/atividades?limite=100');
  const texto = JSON.stringify(dados.filter((a) => a.acao.startsWith('autorizacao.') || a.acao.startsWith('lembrete.')));
  assert.ok(texto.includes('autorização de WhatsApp'));
  assert.ok(!texto.includes(cpf) && !texto.includes('81900000140'));
});
