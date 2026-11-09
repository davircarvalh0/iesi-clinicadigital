import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import { promisify } from 'node:util';
import amqp from 'amqplib';
import { BINDING_PACIENTE, EXCHANGE_EVENTOS, FILA_AGENDAMENTO, idCorrelacaoConsulta } from '@clinica/eventos';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const rabbit = process.env.TEST_RABBITMQ_URL ?? 'amqp://clinica:clinica@localhost:5672';
const executar = promisify(execFile);

async function api(rota, body) {
  const resposta = await fetch(`${base}/api/${rota}`, {
    signal: AbortSignal.timeout(6000),
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
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
    () => Promise.all(['cadastro', 'agendamento'].map(async (servico) => {
      try {
        return (await api(`${servico}/saude`)).status;
      } catch {
        return 0;
      }
    })),
    (respostas) => respostas.every((status) => status === 200),
    'APIs prontas pelo gateway',
  );
});

const cpfFicticio = () => `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
const buscar = (cpf) => api('cadastro/pacientes/busca-cpf', { cpf });
const buscarConsulta = async (id) => {
  const { dados } = await api('agendamento/consultas');
  return dados?.find((consulta) => consulta.id === id);
};

async function agendar(cpf, paciente) {
  const resposta = await api('agendamento/consultas', {
    cpf, nome: paciente?.nome ?? 'Paciente Fictício US08', telefone: paciente?.telefone ?? '81900000008',
    idPaciente: paciente?.id, profissional: 'Profissional Fictício', especialidade: 'Teste',
    inicio: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  assert.equal(resposta.status, 201);
  assert.equal(resposta.dados.idPaciente, paciente?.id ?? null);
  assert.equal(resposta.dados.vinculoPacientePendente, true);
  return resposta.dados;
}

function aguardarVinculo(consulta) {
  return aguardar(
    () => buscarConsulta(consulta.id),
    (atual) => !!atual?.idPaciente && !atual.vinculoPacientePendente,
    'vínculo confirmado',
  );
}

test('US-08: CPF novo converge; CPF existente reaproveita os dados e o ID mestre', { timeout: 120000 }, async () => {
  const cpf = cpfFicticio();
  assert.equal((await buscar(cpf.slice(0, 6))).status, 400);
  assert.deepEqual(await buscar(cpf), { status: 200, dados: { paciente: null } });

  const conexao = await amqp.connect(rabbit);
  try {
    const canal = await conexao.createConfirmChannel();
    const { queue } = await canal.assertQueue('', { exclusive: true });
    await canal.bindQueue(queue, EXCHANGE_EVENTOS, BINDING_PACIENTE);
    const eventos = new Map();
    await canal.consume(queue, (msg) => {
      if (!msg) return;
      const evento = JSON.parse(msg.content);
      eventos.set(evento.id_correlacao, evento);
      canal.ack(msg);
    });

    const novas = await Promise.all([agendar(cpf), agendar(cpf)]);
    const vinculadas = await Promise.all(novas.map(aguardarVinculo));
    const mascarado = cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    const encontrado = await buscar(mascarado);
    assert.equal(encontrado.status, 200);
    const mestre = encontrado.dados.paciente;
    assert.equal(vinculadas[0].idPaciente, mestre.id);
    assert.equal(vinculadas[1].idPaciente, mestre.id);
    const lista = await api(`cadastro/pacientes?busca=${cpf}`);
    assert.equal(lista.dados.totalFiltrado, 1);

    const reutilizada = await agendar(cpf, mestre);
    assert.equal(reutilizada.pacienteNome, mestre.nome);
    assert.equal(reutilizada.pacienteTelefone, mestre.telefone);
    assert.equal((await aguardarVinculo(reutilizada)).idPaciente, mestre.id);

    const incorreta = await agendar(cpf, { ...mestre, id: randomUUID() });
    const confirmada = await aguardarVinculo(incorreta);
    assert.equal(confirmada.idPaciente, mestre.id);
    const evento = await aguardar(
      async () => eventos.get(idCorrelacaoConsulta(incorreta.id)), Boolean, 'evento correlacionado',
    );
    assert.equal(evento.versao, 1);
    assert.equal(evento.payload.id_paciente, mestre.id);
    canal.sendToQueue(FILA_AGENDAMENTO, Buffer.from(JSON.stringify(evento)), { persistent: true });
    await canal.waitForConfirms();
    await aguardar(async () => (await canal.checkQueue(FILA_AGENDAMENTO)).messageCount, (n) => n === 0, 'reenvio');
    const final = await buscarConsulta(incorreta.id);
    assert.equal(final.idPaciente, mestre.id);
    assert.equal(final.atualizadoEm, confirmada.atualizadoEm);
  } finally {
    await conexao.close();
  }
});

test('US-08: Cadastro parado, consulta pendente e recuperação pela fila', { timeout: 120000 }, async () => {
  // Afeta apenas o Cadastro do projeto Compose isolado de demonstração.
  const compose = (acao) => executar('docker', ['compose', '-p', 'iesi-us08', acao, 'cadastro']);
  const cpf = cpfFicticio();
  assert.deepEqual(await buscar(cpf), { status: 200, dados: { paciente: null } });
  let consulta;
  try {
    await compose('stop');
    const indisponivel = await buscar(cpf).then(
      ({ status }) => [502, 503, 504].includes(status),
      (erro) => {
        if (erro.name === 'TimeoutError') return true;
        throw erro;
      },
    );
    assert.ok(indisponivel, 'erro ou timeout de indisponibilidade');
    consulta = await agendar(cpf);
    const pendente = await buscarConsulta(consulta.id);
    assert.equal(pendente.idPaciente, null);
    assert.equal(pendente.vinculoPacientePendente, true);
  } finally {
    await compose('start');
  }
  const confirmada = await aguardarVinculo(consulta);
  const mestre = await buscar(cpf);
  assert.equal(mestre.status, 200);
  assert.equal(confirmada.idPaciente, mestre.dados.paciente.id);
});
