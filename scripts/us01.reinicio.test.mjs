import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import { promisify } from 'node:util';
import amqp from 'amqplib';

// Este teste para o Cadastro temporariamente. Use um projeto Compose isolado.
const projeto = process.env.COMPOSE_PROJECT_NAME;
if (!projeto || process.env.TEST_US01_REINICIO !== '1') {
  throw new Error('Defina COMPOSE_PROJECT_NAME e TEST_US01_REINICIO=1 em um Compose isolado.');
}
const base = process.env.TEST_CADASTRO_URL ?? 'http://localhost:3003';
const broker = process.env.TEST_RABBITMQ_URL ?? 'amqp://clinica:clinica@localhost:5672';
const compose = (acao) => promisify(execFile)('docker', ['compose', '-p', projeto, acao, 'cadastro'], {
  windowsHide: true, timeout: 30_000,
});

async function aguardar(verificar, descricao) {
  const prazo = Date.now() + 25_000;
  while (Date.now() < prazo) {
    const resultado = await verificar();
    if (resultado) return resultado;
    await esperar(200);
  }
  throw new Error(`Tempo esgotado: ${descricao}`);
}

test('US-01: Cadastro retoma a fila e não repete efeitos após reinício', { timeout: 125_000 }, async () => {
  const cpf = `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
  const conexao = await amqp.connect(broker);
  let parou = false;
  try {
    const canal = await conexao.createConfirmChannel();
    const { queue } = await canal.assertQueue('', { exclusive: true });
    await canal.bindQueue(queue, 'clinica.eventos', 'paciente.atualizado');
    const recebidos = [];
    await canal.consume(queue, (msg) => {
      if (!msg) return;
      recebidos.push(JSON.parse(msg.content.toString()));
      canal.ack(msg);
    });
    const entrada = () => {
      const id = randomUUID();
      return {
        id_evento: id, tipo: 'consulta.agendada', versao: 1, origem: 'agendamento',
        ocorrido_em: new Date().toISOString(), id_correlacao: `consulta-${id}`,
        payload: {
          id_consulta: id, paciente: { cpf, nome: 'Paciente Fictício US01', telefone: '81900000001' },
          inicio: new Date(Date.now() + 7 * 86400000).toISOString(),
          profissional: 'Profissional Fictício', especialidade: 'Teste',
        },
      };
    };
    const publicar = (e) => {
      canal.publish('clinica.eventos', e.tipo, Buffer.from(JSON.stringify(e)), { persistent: true });
      return canal.waitForConfirms();
    };
    const primeiro = entrada();
    const pendente = entrada();
    const porCorrelacao = (e) => recebidos.filter((saida) => saida.id_correlacao === e.id_correlacao);
    await publicar(primeiro);
    const antes = await aguardar(() => porCorrelacao(primeiro)[0], 'primeira saída');
    await compose('stop');
    parou = true;
    await publicar(primeiro);
    await publicar(pendente);
    await compose('start');
    parou = false;
    const depois = await aguardar(() => porCorrelacao(pendente)[0], 'saída da consulta pendente');
    assert.equal(depois.versao, 1);
    assert.equal(depois.payload.id_paciente, antes.payload.id_paciente);
    assert.equal(porCorrelacao(primeiro).length, 1);
    const resposta = await fetch(`${base}/pacientes?busca=${cpf}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(resposta.status, 200);
    const dados = await resposta.json();
    assert.equal(dados.totalFiltrado, 1);
    assert.equal(dados.pacientes[0].id, antes.payload.id_paciente);
  } finally {
    try { if (parou) await compose('start'); }
    finally { await conexao.close(); }
  }
});
