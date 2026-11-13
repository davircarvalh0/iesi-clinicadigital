import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import amqp from 'amqplib';
import {
  criarEnvelope, FILA_AGENDAMENTO, FILA_AGENDAMENTO_ERROS, FILA_NOTIFICACAO, FILA_NOTIFICACAO_ERROS,
} from '@clinica/eventos';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const rabbit = process.env.TEST_RABBITMQ_URL ?? 'amqp://clinica:clinica@localhost:5672';

// Valores sentinela: não podem aparecer em atividades nem em motivos.
const CPF_SENTINELA = '00099988877';
const TELEFONE_SENTINELA = '81911112222';

async function api(rota) {
  const resposta = await fetch(`${base}/api/${rota}`, { signal: AbortSignal.timeout(6000) });
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
    () => Promise.all(['agendamento', 'notificacao'].map(async (servico) => {
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

function consultaFicticia(alteracoes = {}) {
  const id = randomUUID();
  const evento = criarEnvelope({
    tipo: 'consulta.agendada',
    origem: 'agendamento',
    id_correlacao: `consulta-${id}`,
    payload: {
      id_consulta: id,
      paciente: { cpf: CPF_SENTINELA, nome: 'Paciente Fictício US04', telefone: TELEFONE_SENTINELA },
      profissional: 'Profissional Fictício',
      especialidade: 'Teste',
      inicio: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  });
  return { ...evento, ...alteracoes };
}

async function entregar(fila, ...mensagens) {
  const conexao = await amqp.connect(rabbit);
  try {
    const canal = await conexao.createConfirmChannel();
    for (const m of mensagens) {
      const conteudo = typeof m === 'string' ? m : JSON.stringify(m);
      canal.sendToQueue(fila, Buffer.from(conteudo), { persistent: true });
    }
    await canal.waitForConfirms();
    await aguardar(async () => (await canal.checkQueue(fila)).messageCount, (n) => n === 0, `fila ${fila} consumida`);
  } finally {
    await conexao.close();
  }
}

// Lê sem ack: as mensagens voltam para a fila ao fechar a conexão.
async function lerFilaErros(fila) {
  const conexao = await amqp.connect(rabbit);
  try {
    const canal = await conexao.createChannel();
    const lidas = [];
    for (let msg = await canal.get(fila); msg; msg = await canal.get(fila)) {
      lidas.push({ conteudo: msg.content.toString(), motivo: msg.properties.headers?.['x-motivo'] });
    }
    return lidas;
  } finally {
    await conexao.close();
  }
}

const motivoNaFila = async (fila, idEvento) => {
  const lidas = await lerFilaErros(fila);
  return lidas.find((m) => m.conteudo.includes(idEvento))?.motivo;
};

test('US-04 CA1 e CA3: evento malformado vai para a fila de erros com motivo, sem lembrete', { timeout: 120000 }, async () => {
  const semPayload = consultaFicticia({ payload: undefined });
  const dataInvalida = consultaFicticia();
  dataInvalida.payload.inicio = 'amanhã';
  const semCorrelacao = consultaFicticia({ id_correlacao: '' });

  await entregar(FILA_NOTIFICACAO, semPayload, dataInvalida, semCorrelacao, '{ isto não é json');
  await esperar(1000);

  assert.equal(await motivoNaFila(FILA_NOTIFICACAO_ERROS, semPayload.id_evento), 'payload ausente');
  assert.equal(await motivoNaFila(FILA_NOTIFICACAO_ERROS, dataInvalida.id_evento), 'payload.inicio inválido');
  assert.equal(await motivoNaFila(FILA_NOTIFICACAO_ERROS, semCorrelacao.id_evento), 'id_correlacao ausente');
  assert.equal(await motivoNaFila(FILA_NOTIFICACAO_ERROS, 'isto não é json'), 'mensagem não é JSON válido');

  const { dados: lembretes } = await api(`notificacao/lembretes?consulta=${dataInvalida.payload.id_consulta}`);
  assert.deepEqual(lembretes, []);

  const { dados: atividades } = await api('notificacao/atividades?limite=100');
  const recusadas = atividades.filter((a) => a.acao === 'evento.rejeitado' &&
    [semPayload.id_evento, dataInvalida.id_evento, semCorrelacao.id_evento].includes(a.idEvento));
  assert.equal(recusadas.length, 3);
  // Só as atividades de recusa; o restante do feed é escopo da US-16.
  assert.doesNotMatch(JSON.stringify(recusadas), new RegExp(`${CPF_SENTINELA}|${TELEFONE_SENTINELA}`));
});

test('US-04 CA2: campo aditivo é aceito; versão incompatível é recusada com motivo', { timeout: 120000 }, async () => {
  const aditivo = consultaFicticia({ campo_novo: 'ignorado' });
  aditivo.payload.sala = '3';
  const versaoNova = consultaFicticia({ versao: 2 });

  await entregar(FILA_NOTIFICACAO, aditivo, versaoNova);

  await aguardar(
    async () => (await api(`notificacao/lembretes?consulta=${aditivo.payload.id_consulta}`)).dados?.[0],
    (lembrete) => lembrete?.status === 'programado',
    'lembrete do evento com campo aditivo',
  );
  assert.equal(
    await motivoNaFila(FILA_NOTIFICACAO_ERROS, versaoNova.id_evento),
    'versão 2 não suportada para consulta.agendada',
  );
  const { dados } = await api(`notificacao/lembretes?consulta=${versaoNova.payload.id_consulta}`);
  assert.deepEqual(dados, []);
});

test('US-04: Agendamento recusa paciente.atualizado incompatível com motivo', { timeout: 120000 }, async () => {
  const evento = criarEnvelope({
    tipo: 'paciente.atualizado',
    origem: 'cadastro',
    id_correlacao: `paciente-${randomUUID()}`,
    payload: { id_paciente: randomUUID(), cpf: CPF_SENTINELA, nome: 'Paciente Fictício US04', telefone: TELEFONE_SENTINELA, email: null, revisao: 0 },
  });

  await entregar(FILA_AGENDAMENTO, evento);
  await esperar(500);

  assert.equal(await motivoNaFila(FILA_AGENDAMENTO_ERROS, evento.id_evento), 'payload.revisao inválida');
});