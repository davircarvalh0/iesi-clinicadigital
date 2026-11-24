import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import amqp from 'amqplib';
import { criarEnvelope, FILA_AGENDAMENTO, FILA_NOTIFICACAO } from '@clinica/eventos';

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
    () => Promise.all(['cadastro', 'agendamento', 'notificacao'].map(async (servico) => {
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

const buscarConsulta = async (id) => {
  const { dados } = await api('agendamento/consultas');
  return dados?.find((consulta) => consulta.id === id);
};

const buscarLembrete = async (idConsulta) => {
  const { dados } = await api(`notificacao/lembretes?consulta=${idConsulta}`);
  return dados?.[0];
};

/** Agenda uma consulta com CPF novo e espera vínculo com o mestre e lembrete programado. */
async function prepararPaciente() {
  const resposta = await api('agendamento/consultas', {
    method: 'POST',
    body: {
      cpf: cpfFicticio(), nome: 'Paciente Fictício US03', telefone: '81900000031',
      profissional: 'Profissional Fictício', especialidade: 'Teste',
      inicio: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  });
  assert.equal(resposta.status, 201);
  const consulta = await aguardar(
    () => buscarConsulta(resposta.dados.id),
    (atual) => !!atual?.idPaciente && !atual.vinculoPacientePendente,
    'vínculo com o paciente mestre',
  );
  await aguardar(() => buscarLembrete(consulta.id), (l) => l?.status === 'programado', 'lembrete programado');
  const { dados: paciente } = await api(`cadastro/pacientes/${consulta.idPaciente}`);
  return { consulta, paciente };
}

async function corrigirTelefone(paciente, telefone) {
  const resposta = await api(`cadastro/pacientes/${paciente.id}`, {
    method: 'PATCH',
    body: { revisao: paciente.revisao, telefone },
  });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.dados.revisao, paciente.revisao + 1);
  return resposta.dados;
}

test('US-03: correção no cadastro chega à agenda e ao lembrete programado (CA1, CA3)', { timeout: 120000 }, async () => {
  const { consulta, paciente } = await prepararPaciente();
  const corrigido = await corrigirTelefone(paciente, '81900000032');

  const agenda = await aguardar(
    () => buscarConsulta(consulta.id),
    (atual) => atual?.pacienteTelefone === '81900000032',
    'telefone atualizado na agenda',
  );
  assert.equal(agenda.pacienteRevisao, corrigido.revisao);

  await aguardar(
    () => buscarLembrete(consulta.id),
    (lembrete) => lembrete?.telefone === '81900000032' && lembrete.status === 'programado',
    'telefone atualizado no lembrete',
  );
});

test('US-03: revisão antiga ou repetida não sobrescreve a mais recente (CA2)', { timeout: 120000 }, async () => {
  const { consulta, paciente } = await prepararPaciente();
  const corrigido = await corrigirTelefone(paciente, '81900000033');
  await aguardar(
    () => buscarConsulta(consulta.id),
    (atual) => atual?.pacienteRevisao === corrigido.revisao,
    'revisão nova aplicada na agenda',
  );
  await aguardar(() => buscarLembrete(consulta.id), (l) => l?.telefone === '81900000033', 'revisão nova no lembrete');

  // Simula a entrega atrasada da revisão anterior, com um telefone que não deveria voltar.
  const atrasado = criarEnvelope({
    tipo: 'paciente.atualizado',
    origem: 'cadastro',
    id_correlacao: `paciente-${paciente.id}`,
    payload: {
      id_paciente: paciente.id, cpf: paciente.cpf, nome: paciente.nome,
      telefone: '81900000039', email: null, revisao: paciente.revisao,
    },
  });

  const conexao = await amqp.connect(rabbit);
  try {
    const canal = await conexao.createConfirmChannel();
    for (const fila of [FILA_AGENDAMENTO, FILA_NOTIFICACAO]) {
      // Duas vezes: atraso e duplicação na mesma verificação.
      canal.sendToQueue(fila, Buffer.from(JSON.stringify(atrasado)), { persistent: true });
      canal.sendToQueue(fila, Buffer.from(JSON.stringify(atrasado)), { persistent: true });
    }
    await canal.waitForConfirms();
    for (const fila of [FILA_AGENDAMENTO, FILA_NOTIFICACAO]) {
      await aguardar(async () => (await canal.checkQueue(fila)).messageCount, (n) => n === 0, `fila ${fila} consumida`);
    }
  } finally {
    await conexao.close();
  }
  await esperar(1500);

  const agenda = await buscarConsulta(consulta.id);
  assert.equal(agenda.pacienteTelefone, '81900000033');
  assert.equal(agenda.pacienteRevisao, corrigido.revisao);
  const lembrete = await buscarLembrete(consulta.id);
  assert.equal(lembrete.telefone, '81900000033');
});