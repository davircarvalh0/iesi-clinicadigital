import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import amqp from 'amqplib';

// Executar somente em ambiente local de demonstração, com CANAL_ENVIO=log.
const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const rabbit = process.env.TEST_RABBITMQ_URL ?? 'amqp://clinica:clinica@localhost:5672';
async function api(path, body, method = 'POST') {
  const resposta = await fetch(`${base}/api/${path}`, body === undefined ? {} : {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: resposta.status, dados: await resposta.json() };
}
async function aguardar(carregar, condicao, descricao) {
  const limite = Date.now() + 20000;
  while (Date.now() < limite) {
    const dados = await carregar();
    if (condicao(dados)) return dados;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Tempo esgotado: ${descricao}`);
}

test('US-07: mestre real, busca, edição, concorrência, eventos e idempotência', { timeout: 90000 }, async (t) => {
  const conexao = await amqp.connect(rabbit);
  const canal = await conexao.createConfirmChannel();
  const fila = (await canal.assertQueue('', { exclusive: true })).queue;
  await canal.bindQueue(fila, 'clinica.eventos', 'paciente.atualizado');
  const eventos = [];
  await canal.consume(fila, (msg) => { if (msg) { eventos.push(JSON.parse(msg.content)); canal.ack(msg); } });
  const publicar = async (evento) => {
    canal.publish('clinica.eventos', evento.tipo, Buffer.from(JSON.stringify(evento)), { persistent: true });
    await canal.waitForConfirms();
  };
  const cpf = `000${String(Date.now()).slice(-8)}`;
  const nome = `Paciente Fictício US07 ${String(Date.now()).slice(-6)}`;
  const lista = async (busca = cpf) => (await api(`cadastro/pacientes?busca=${encodeURIComponent(busca)}`)).dados;
  let paciente, consulta;
  try {
    await t.test('CA1/CA3: duas consultas geram um único paciente; total vem do mestre', async () => {
      const dados = { nome, cpf, telefone: '81900000001', profissional: 'Profissional Fictício', especialidade: 'Teste',
        inicio: new Date(Date.now() + 7 * 86400000).toISOString() };
      consulta = await api('agendamento/consultas', dados);
      assert.equal(consulta.status, 201);
      assert.equal((await api('agendamento/consultas', dados)).status, 201);
      const resultado = await aguardar(lista, (d) => d.totalFiltrado === 1, 'criação do mestre');
      paciente = resultado.pacientes[0];
      assert.equal(resultado.pacientes.length, 1);
      assert.ok(resultado.total >= resultado.totalFiltrado);
      const porNome = await lista(nome.toLowerCase());
      const porCpf = await lista(`${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6,9)}-${cpf.slice(9)}`);
      assert.equal(porNome.pacientes[0].id, paciente.id);
      assert.equal(porCpf.pacientes[0].id, paciente.id);
      assert.equal((await lista('SemResultadoUS07')).totalFiltrado, 0);
      const pagina = (await api('cadastro/pacientes?tamanhoPagina=1')).dados;
      assert.equal(pagina.pacientes.length, 1);
      assert.equal(pagina.total, resultado.total);
    });
    await t.test('CA2: edição retorna valores normalizados; erro não altera o mestre; revisão evita perda', async () => {
      const rota = `cadastro/pacientes/${paciente.id}`;
      assert.equal((await api(rota, { telefone: '123', email: null, revisao: 1 }, 'PATCH')).status, 400);
      const salvo = await api(rota, { telefone: '(81) 90000-0002', email: 'us07@example.invalid', revisao: paciente.revisao }, 'PATCH');
      assert.equal(salvo.status, 200);
      assert.equal(salvo.dados.telefone, '81900000002');
      assert.equal(salvo.dados.revisao, paciente.revisao + 1);
      assert.equal((await api(rota, { telefone: '81900000003', email: null, revisao: paciente.revisao }, 'PATCH')).status, 409);
      paciente = salvo.dados;
      assert.equal((await lista()).pacientes[0].telefone, paciente.telefone);
      assert.equal((await api('cadastro/pacientes/inexistente', { telefone: '81900000003', email: null, revisao: 1 }, 'PATCH')).status, 404);
    });
    await t.test('paciente.atualizado v1 correlacionado sincroniza lembretes e ignora eventos antigos/duplicados', async () => {
      const evento = await aguardar(async () => eventos.find((e) => e.payload.cpf === cpf && e.payload.revisao === paciente.revisao), Boolean, 'outbox');
      assert.equal(evento.versao, 1);
      assert.equal(evento.id_correlacao, `paciente-${paciente.id}`);
      const lembretes = async () => (await api('notificacao/lembretes')).dados;
      await aguardar(lembretes, (ls) => ls.filter((l) => l.pacienteCpf === cpf).length === 2 && ls.filter((l) => l.pacienteCpf === cpf).every((l) => l.telefone === paciente.telefone), 'sincronização de contato');
      await publicar(evento);
      await publicar({ ...evento, id_evento: randomUUID(), payload: { ...evento.payload, revisao: 1, telefone: '81900000001' } });
      // Uma nova consulta com contato antigo não desfaz a correção no mestre nem nos lembretes.
      const nova = await api('agendamento/consultas', { nome, cpf, telefone: '81900000001', profissional: 'Profissional Fictício', especialidade: 'Teste', inicio: new Date(Date.now() + 8 * 86400000).toISOString() });
      assert.equal(nova.status, 201);
      await aguardar(lembretes, (ls) => ls.filter((l) => l.pacienteCpf === cpf).length === 3 && ls.filter((l) => l.pacienteCpf === cpf).every((l) => l.telefone === paciente.telefone), 'contato mestre na nova consulta');
      const atualizado = await lista();
      assert.equal(atualizado.totalFiltrado, 1);
      assert.equal(atualizado.pacientes[0].telefone, paciente.telefone);
      const eventoConsulta = { id_evento: randomUUID(), tipo: 'consulta.agendada', versao: 1, origem: 'agendamento',
        ocorrido_em: new Date().toISOString(), id_correlacao: `consulta-${consulta.dados.id}`,
        payload: { id_consulta: consulta.dados.id, paciente: { cpf, nome, telefone: '81900000001' }, profissional: 'Profissional Fictício', especialidade: 'Teste', inicio: consulta.dados.inicio } };
      await publicar(eventoConsulta); await publicar(eventoConsulta);
      const barreira = `barreira-${randomUUID()}`;
      await publicar({ ...eventoConsulta, id_evento: randomUUID(), id_correlacao: barreira });
      await aguardar(async () => eventos.some((e) => e.id_correlacao === barreira), Boolean, 'barreira após duplicata');
      assert.equal(eventos.filter((e) => e.id_correlacao === eventoConsulta.id_correlacao).length, 2);
      assert.equal((await lista()).totalFiltrado, 1);
    });
  } finally { await canal.close(); await conexao.close(); }
});
