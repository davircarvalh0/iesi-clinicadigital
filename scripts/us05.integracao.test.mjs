import { fetch } from './http-autenticado.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import { promisify } from 'node:util';
import amqp from 'amqplib';
import {
  criarEnvelope, FILA_AGENDAMENTO_ERROS, FILA_CADASTRO_ERROS, FILA_NOTIFICACAO, FILA_NOTIFICACAO_ERROS,
} from '@clinica/eventos';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const rabbit = process.env.TEST_RABBITMQ_URL ?? 'amqp://clinica:clinica@localhost:5672';
const projeto = process.env.COMPOSE_PROJECT_NAME ?? 'iesi-clinicadigital-teste';
const executar = promisify(execFile);
const compose = (...args) => executar('docker', ['compose', '-p', projeto, ...args]);

async function api(rota) {
  const resposta = await fetch(`${base}/api/${rota}`, { signal: AbortSignal.timeout(6000) });
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
        return (await api('notificacao/saude')).status;
      } catch {
        return 0;
      }
    },
    (status) => status === 200,
    'Notificação pronta pelo gateway',
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
      paciente: { cpf: '00055566677', nome: 'Paciente Fictício US05', telefone: '81900000051' },
      profissional: 'Profissional Fictício',
      especialidade: 'Teste',
      inicio: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  });
}

// Lê sem ack: as mensagens voltam para a fila ao fechar a conexão.
async function copiasNaFila(fila, idEvento) {
  const conexao = await amqp.connect(rabbit);
  try {
    const canal = await conexao.createChannel();
    const copias = [];
    for (let msg = await canal.get(fila); msg; msg = await canal.get(fila)) {
      if (msg.content.toString().includes(idEvento)) copias.push(msg.properties.headers ?? {});
    }
    return copias;
  } finally {
    await conexao.close();
  }
}

test('US-05 CA3: falha persistente termina só na fila de erros da Notificação, com id e motivo', { timeout: 180000 }, async () => {
  const evento = consultaFicticia();
  try {
    await compose('stop', 'db-notificacao');

    const conexao = await amqp.connect(rabbit);
    try {
      const canal = await conexao.createConfirmChannel();
      canal.sendToQueue(FILA_NOTIFICACAO, Buffer.from(JSON.stringify(evento)), { persistent: true });
      await canal.waitForConfirms();
    } finally {
      await conexao.close();
    }

    const copias = await aguardar(
      () => copiasNaFila(FILA_NOTIFICACAO_ERROS, evento.id_evento),
      (lista) => lista.length > 0,
      'evento na fila de erros da Notificação',
      90000,
    );
    assert.equal(copias.length, 1, 'uma única cópia, sem duplicação nas tentativas');
    assert.match(copias[0]['x-motivo'], /^falha no processamento após 3 tentativas/);
    assert.equal(copias[0]['x-tentativas'], 3);
  } finally {
    await compose('up', '-d', '--wait', 'db-notificacao');
  }

  // Antes, o nack mandava a mensagem para a exchange fanout e ela aparecia nas três filas de erros.
  assert.deepEqual(await copiasNaFila(FILA_AGENDAMENTO_ERROS, evento.id_evento), []);
  assert.deepEqual(await copiasNaFila(FILA_CADASTRO_ERROS, evento.id_evento), []);

  const { dados: lembretes } = await aguardar(
    () => api(`notificacao/lembretes?consulta=${evento.payload.id_consulta}`),
    (resposta) => resposta.status === 200,
    'Notificação respondendo após o banco voltar',
  );
  assert.deepEqual(lembretes, [], 'evento esgotado não gera lembrete');
});
