import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { before, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import { promisify } from 'node:util';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const projeto = process.env.COMPOSE_PROJECT_NAME ?? 'iesi-clinicadigital-teste';
const executar = promisify(execFile);

// Valores sentinela fictícios: não podem aparecer em atividades nem em logs.
const NOME = `Sentinela Dezesseis ${randomInt(1000, 9999)}`;
const CPF = `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
const TELEFONE = `8197${String(randomInt(10_000_000)).padStart(7, '0')}`;
const proibidos = [NOME, CPF, TELEFONE, CPF.slice(-8), TELEFONE.slice(-8)];

async function api(rota, { method = 'GET', body } = {}) {
  const resposta = await fetch(`${base}/api/${rota}`, {
    method,
    signal: AbortSignal.timeout(6000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => null) };
}

async function aguardar(carregar, condicao, descricao) {
  const limite = Date.now() + 45000;
  while (Date.now() < limite) {
    const dado = await carregar();
    if (condicao(dado)) return dado;
    await esperar(500);
  }
  throw new Error(`Tempo esgotado: ${descricao}`);
}

function semSentinelas(texto, onde) {
  for (const valor of proibidos) {
    assert.ok(!texto.includes(valor), `${onde} contém um valor pessoal sentinela`);
  }
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

const emHoras = (horas) => new Date(Date.now() + horas * 3600_000).toISOString();

async function agendar(inicio) {
  const resposta = await api('agendamento/consultas', {
    method: 'POST',
    body: { nome: NOME, cpf: CPF, telefone: TELEFONE, profissional: 'Profissional Fictício', especialidade: 'Teste', inicio },
  });
  assert.equal(resposta.status, 201);
  return resposta.dados.id;
}

async function autorizarWhatsApp() {
  const { dados } = await aguardar(
    () => api('cadastro/pacientes/busca-cpf', { method: 'POST', body: { cpf: CPF } }),
    (r) => !!r.dados?.paciente, 'paciente no Cadastro',
  );
  const id = dados.paciente.id;
  const registro = await api(`cadastro/pacientes/${id}/autorizacoes`, {
    method: 'POST', body: { canal: 'whatsapp', situacao: 'autorizado', origem: 'presencial' },
  });
  assert.equal(registro.status, 201);
  await aguardar(
    async () => (await api(`notificacao/autorizacoes/${id}`)).dados,
    (copia) => copia?.autorizacoes?.some((a) => a.canal === 'whatsapp' && a.situacao === 'autorizado'),
    'autorização copiada pela Notificação',
  );
}

const lembrete = async (idConsulta) => (await api(`notificacao/lembretes?consulta=${idConsulta}`)).dados?.[0];

test('US-16: atividades, painel e logs não expõem nome, CPF nem telefone (CA1, CA2, CA3)', { timeout: 180000 }, async () => {
  const inicioDoTeste = new Date(Date.now() - 5000).toISOString();

  // Consulta futura: passa por programado, reprogramado e cancelado.
  const cancelada = await agendar(emHoras(24 * 7));
  // US-14: sem autorização de WhatsApp o lembrete seria bloqueado; registra antes da consulta próxima.
  await autorizarWhatsApp();
  // Consulta próxima: com antecedência padrão de 24h, o lembrete é enviado no próximo ciclo.
  const enviada = await agendar(emHoras(1));

  await aguardar(() => lembrete(enviada), (l) => l?.status === 'enviado', 'lembrete enviado');
  await aguardar(() => lembrete(cancelada), (l) => l?.status === 'programado', 'lembrete programado');
  assert.equal((await api(`agendamento/consultas/${cancelada}`, { method: 'PATCH', body: { inicio: emHoras(24 * 8) } })).status, 200);
  await aguardar(
    async () => (await api('notificacao/atividades?limite=100')).dados,
    (lista) => lista?.some((a) => a.idConsulta === cancelada && a.acao === 'lembrete.reprogramado'),
    'lembrete reprogramado',
  );
  assert.equal((await api(`agendamento/consultas/${cancelada}`, { method: 'DELETE' })).status, 200);
  await aguardar(() => lembrete(cancelada), (l) => l?.status === 'cancelado', 'lembrete cancelado');

  // CA1: atividades identificam a consulta pelo id e não guardam dados pessoais.
  const { dados: atividades } = await api('notificacao/atividades?limite=100');
  const minhas = atividades.filter((a) => [enviada, cancelada].includes(a.idConsulta));
  const acoes = new Set(minhas.map((a) => a.acao));
  for (const acao of ['lembrete.programado', 'lembrete.enviado', 'lembrete.reprogramado', 'lembrete.cancelado']) {
    assert.ok(acoes.has(acao), `atividade ${acao} registrada`);
  }
  semSentinelas(JSON.stringify(minhas), 'Atividades da Notificação');

  // CA2: o painel de eventos da recepção só recebe nome, horário e ids; nada de CPF ou telefone.
  const { dados: eventos } = await api('agendamento/eventos?limite=100');
  const doTeste = eventos.filter((e) => [enviada, cancelada].includes(e.idConsulta));
  assert.ok(doTeste.length >= 3);
  for (const e of doTeste) {
    assert.deepEqual(Object.keys(e).sort(), ['criadoEm', 'duplicado', 'id', 'idConsulta', 'idEvento', 'inicio', 'pacienteNome', 'publicadoEm', 'tipo']);
  }
  assert.ok(!JSON.stringify(doTeste).includes(CPF) && !JSON.stringify(doTeste).includes(TELEFONE));

  // CA3: nenhum log dos serviços desde o início do teste contém os valores sentinela.
  const { stdout } = await executar(
    'docker',
    ['compose', '-p', projeto, 'logs', '--no-color', '--since', inicioDoTeste, 'agendamento', 'notificacao', 'cadastro'],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  assert.ok(stdout.includes('[atividade] lembrete.enviado'), 'logs da Notificação foram lidos');
  semSentinelas(stdout, 'Logs dos serviços');
});
