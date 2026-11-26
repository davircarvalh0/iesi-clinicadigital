import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import { promisify } from 'node:util';
import amqp from 'amqplib';
import { criarEnvelope, FILA_NOTIFICACAO, FILA_NOTIFICACAO_ERROS } from '@clinica/eventos';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const rabbit = process.env.TEST_RABBITMQ_URL ?? 'amqp://clinica:clinica@localhost:5672';
const projeto = process.env.COMPOSE_PROJECT_NAME ?? 'iesi-clinicadigital-teste';
const executar = promisify(execFile);
const compose = (...args) => executar('docker', ['compose', '-p', projeto, ...args]);

const CPF = '00066677788';
const NOME = 'Paciente Fictício US06';
const TELEFONE = '81900000061';
const SOLICITANTE = 'Operadora Fictícia';

async function api(rota, { method = 'GET', body } = {}) {
  const resposta = await fetch(`${base}/api/${rota}`, {
    method,
    signal: AbortSignal.timeout(6000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => null) };
}

async function aguardar(carregar, condicao, descricao, limiteMs = 30000) {
  const limite = Date.now() + limiteMs;
  while (Date.now() < limite) {
    const dado = await carregar();
    if (condicao(dado)) return dado;
    await esperar(500);
  }
  throw new Error(`Tempo esgotado: ${descricao}`);
}

before(async () => {
  await aguardar(
    async () => {
      try {
        return (await api('notificacao/operacao/erros')).status;
      } catch {
        return 0;
      }
    },
    (status) => status === 200,
    'rotas /operacao ativas (defina OPERACAO_HABILITADA=true ao subir o Compose)',
  );
});

function consultaFicticia() {
  const id = randomUUID();
  return criarEnvelope({
    tipo: 'consulta.agendada',
    origem: 'agendamento',
    id_correlacao: `consulta-${id}`,
    payload: {
      id_consulta: id,
      paciente: { cpf: CPF, nome: NOME, telefone: TELEFONE },
      profissional: 'Profissional Fictício',
      especialidade: 'Teste',
      inicio: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  });
}

async function publicar(fila, evento, headers = {}) {
  const conexao = await amqp.connect(rabbit);
  try {
    const canal = await conexao.createConfirmChannel();
    canal.sendToQueue(fila, Buffer.from(JSON.stringify(evento)), { persistent: true, headers });
    await canal.waitForConfirms();
  } finally {
    await conexao.close();
  }
}

// Lê a fila de erros direto no broker (a API precisa do banco, que está parado na etapa de falha).
// Sem ack: as mensagens voltam para a fila ao fechar a conexão.
async function copiasNaFila(fila, idEvento) {
  const conexao = await amqp.connect(rabbit);
  try {
    const canal = await conexao.createChannel();
    let copias = 0;
    for (let msg = await canal.get(fila); msg; msg = await canal.get(fila)) {
      if (msg.content.toString().includes(idEvento)) copias += 1;
    }
    return copias;
  } finally {
    await conexao.close();
  }
}

const erros = async () => (await api('notificacao/operacao/erros?limite=100')).dados ?? [];
const naFilaDeErros = async (idEvento) => (await erros()).find((m) => m.idEvento === idEvento);
const lembretes = async (idConsulta) => (await api(`notificacao/lembretes?consulta=${idConsulta}`)).dados ?? [];
const historico = async (idEvento) => (await api(`notificacao/operacao/reprocessamentos?idEvento=${idEvento}`)).dados ?? [];
const atividades = async () => (await api('notificacao/atividades?limite=100')).dados ?? [];

const reprocessar = (idEvento, corpo = { solicitante: SOLICITANTE }) =>
  api(`notificacao/operacao/erros/${encodeURIComponent(idEvento)}/reprocessar`, { method: 'POST', body: corpo });

test('US-06: falha, correção, replay e duplicata', { timeout: 240000 }, async () => {
  const evento = consultaFicticia();
  const idConsulta = evento.payload.id_consulta;

  // Falha: com o banco da Notificação parado, o evento esgota as tentativas e vai para a fila de erros.
  try {
    await compose('stop', 'db-notificacao');
    await publicar(FILA_NOTIFICACAO, evento);
    await aguardar(() => copiasNaFila(FILA_NOTIFICACAO_ERROS, evento.id_evento), (copias) => copias > 0, 'evento na fila de erros', 90000);
  } finally {
    // Correção: o banco volta.
    await compose('up', '-d', '--wait', 'db-notificacao');
  }

  // CA1: a operação mostra tipo, id, tentativas e motivo, sem dados pessoais.
  const emErro = await aguardar(() => naFilaDeErros(evento.id_evento), Boolean, 'operação lista o evento da fila de erros');
  assert.equal(emErro.tipo, 'consulta.agendada');
  assert.equal(emErro.idConsulta, idConsulta);
  assert.equal(emErro.tentativas, 3);
  assert.match(emErro.motivo, /^falha no processamento após 3 tentativas/);
  assert.equal(emErro.reprocessavel, true);
  assert.equal(emErro.jaProcessado, false);
  assert.equal(emErro.reprocessamentos, 0);
  const listagem = JSON.stringify(await erros());
  for (const sentinela of [CPF, NOME, TELEFONE]) assert.ok(!listagem.includes(sentinela), `a listagem não deve expor ${sentinela}`);
  assert.deepEqual(await lembretes(idConsulta), [], 'sem reprocessamento não há lembrete');

  // CA2: o pedido exige solicitante; a mensagem só sai da fila depois da republicação confirmada.
  assert.equal((await reprocessar(evento.id_evento, {})).status, 400);
  assert.ok(await naFilaDeErros(evento.id_evento), 'pedido inválido não consome a mensagem');
  const pedido = await reprocessar(evento.id_evento);
  assert.equal(pedido.status, 202);
  assert.equal(pedido.dados.idEvento, evento.id_evento);
  assert.equal(pedido.dados.solicitante, SOLICITANTE);
  assert.equal(pedido.dados.resultado, 'republicado');
  assert.ok(Number.isFinite(Date.parse(pedido.dados.solicitadoEm)));

  const [lembrete] = await aguardar(() => lembretes(idConsulta), (lista) => lista.length === 1, 'lembrete criado pelo replay');
  assert.equal(lembrete.status, 'programado');
  assert.equal(await naFilaDeErros(evento.id_evento), undefined, 'a mensagem saiu da fila de erros');
  const programada = (await atividades()).find((a) => a.acao === 'lembrete.programado' && a.idConsulta === idConsulta);
  assert.equal(programada.idEvento, evento.id_evento, 'o replay manteve o id_evento');
  assert.equal((await historico(evento.id_evento)).length, 1);
  assert.equal((await historico(evento.id_evento))[0].solicitante, SOLICITANTE);

  // CA3 (duplicata): outra cópia do mesmo evento volta para a fila de erros; o replay é ignorado como duplicado.
  await publicar(FILA_NOTIFICACAO_ERROS, evento, { 'x-motivo': 'cópia de teste', 'x-tentativas': 3 });
  const copia = await aguardar(() => naFilaDeErros(evento.id_evento), Boolean, 'cópia na fila de erros');
  assert.equal(copia.jaProcessado, true);
  assert.equal(copia.reprocessamentos, 1);
  assert.equal((await reprocessar(evento.id_evento)).status, 202);
  await aguardar(
    async () => (await atividades()).some((a) => a.acao === 'evento.duplicado' && a.idEvento === evento.id_evento),
    Boolean,
    'duplicata ignorada',
  );
  assert.equal((await lembretes(idConsulta)).length, 1, 'a duplicata não cria um segundo lembrete');
  assert.equal((await historico(evento.id_evento)).length, 2, 'as duas tentativas ficam registradas');
  assert.equal(await naFilaDeErros(evento.id_evento), undefined);
});

test('US-06 CA3: nova falha mantém o registro e devolve a mensagem à fila de erros', { timeout: 120000 }, async () => {
  // Evento com payload vazio: o consumidor o recusa de novo, com motivo, sem criar lembrete.
  const incompleto = { ...consultaFicticia(), payload: {} };
  await publicar(FILA_NOTIFICACAO_ERROS, incompleto, { 'x-motivo': 'falha de teste', 'x-tentativas': 3 });
  assert.ok(await aguardar(() => naFilaDeErros(incompleto.id_evento), Boolean, 'evento incompleto na fila de erros'));

  assert.equal((await reprocessar(incompleto.id_evento)).status, 202);
  const denovo = await aguardar(
    async () => {
      const mensagem = await naFilaDeErros(incompleto.id_evento);
      return mensagem?.motivo.includes('payload') ? mensagem : undefined;
    },
    Boolean,
    'mensagem de volta à fila de erros com o novo motivo',
  );
  assert.match(denovo.motivo, /payload\.id_consulta ausente/);
  assert.equal(denovo.reprocessamentos, 1);
  assert.equal((await historico(incompleto.id_evento)).length, 1);
});

test('US-06: mensagem inexistente responde 404 e mensagem ilegível não é reprocessável', { timeout: 60000 }, async () => {
  const inexistente = await reprocessar(`nao-existe-${randomUUID()}`);
  assert.equal(inexistente.status, 404);

  const conexao = await amqp.connect(rabbit);
  try {
    const canal = await conexao.createConfirmChannel();
    canal.sendToQueue(FILA_NOTIFICACAO_ERROS, Buffer.from(`isto não é JSON ${CPF}`), { persistent: true, headers: { 'x-motivo': 'ilegível' } });
    await canal.waitForConfirms();
  } finally {
    await conexao.close();
  }
  const ilegivel = await aguardar(async () => (await erros()).find((m) => m.idEvento === null), Boolean, 'mensagem ilegível listada');
  assert.equal(ilegivel.reprocessavel, false);
  assert.ok(!JSON.stringify(await erros()).includes(CPF));
});
