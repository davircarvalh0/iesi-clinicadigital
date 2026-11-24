import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';

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

const cpfFicticio = () => `000${String(randomInt(100_000_000)).padStart(8, '0')}`;

async function agendar() {
  const resposta = await api('agendamento/consultas', {
    method: 'POST',
    body: {
      nome: 'Paciente Fictício US11', cpf: cpfFicticio(), telefone: '81900000111',
      profissional: 'Profissional Fictício', especialidade: 'Teste',
      inicio: new Date(Date.now() + 2 * 86400000).toISOString(),
    },
  });
  assert.equal(resposta.status, 201);
  return resposta.dados;
}

const remarcar = (id, inicio) => api(`agendamento/consultas/${id}`, { method: 'PATCH', body: { inicio } });
const cancelar = (id) => api(`agendamento/consultas/${id}`, { method: 'DELETE' });
const buscarLembrete = async (idConsulta) => {
  const { dados } = await api(`notificacao/lembretes?consulta=${idConsulta}`);
  return dados?.[0];
};

test('US-11 CA1 e CA2: consulta cancelada logo após o agendamento nunca chega a ser enviada', { timeout: 60000 }, async () => {
  const consulta = await cancelar((await agendar()).id).then(async (resposta) => {
    assert.equal(resposta.status, 200);
    return resposta.dados;
  });

  const lembrete = await aguardar(
    () => buscarLembrete(consulta.id),
    (l) => l?.status === 'cancelado',
    'lembrete cancelado antes de qualquer tentativa de envio',
  );
  assert.equal(lembrete.status, 'cancelado');
  assert.equal(lembrete.tentativas, 0, 'nenhuma tentativa de envio chegou a ocorrer');
  assert.equal(lembrete.idExterno, null);
});

test('US-11 CA2: remarcações em sequência terminam no horário da última, sem regredir', { timeout: 60000 }, async () => {
  const consulta = await agendar();
  await aguardar(() => buscarLembrete(consulta.id), Boolean, 'lembrete programado');

  const primeiro = new Date(Date.now() + 3 * 86400000).toISOString();
  const segundo = new Date(Date.now() + 5 * 86400000).toISOString();
  await Promise.all([remarcar(consulta.id, primeiro), remarcar(consulta.id, segundo)].map(async (p) => {
    const resposta = await p;
    assert.equal(resposta.status, 200);
  }));

  const lembrete = await aguardar(
    () => buscarLembrete(consulta.id),
    (l) => l?.status === 'programado',
    'lembrete reprogramado estabiliza',
  );
  assert.equal(new Date(lembrete.enviarEm) < new Date(segundo), true);
  // Independentemente da ordem de entrega das duas remarcações, o resultado final reflete
  // a consulta publicada por último pelo Agendamento (sequência mais alta), nunca a anterior.
  const consultaAtual = (await api('agendamento/consultas')).dados.find((c) => c.id === consulta.id);
  assert.equal(consultaAtual.inicio, segundo);
});
