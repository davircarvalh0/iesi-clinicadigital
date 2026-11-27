// US-30: confirmação pelo WhatsApp de ponta a ponta (Compose isolado, envio simulado).
// Lembrete enviado → resposta do paciente → consulta.confirmada (Notificação) → consulta confirmada (Agendamento).
import assert from 'node:assert/strict';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { aguardar, api, cpfFicticio, criarProfissional, entrarAdmin } from './apoio-api.mjs';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
const telefoneUnico = () => `819${String(randomInt(100_000_000)).padStart(8, '0')}`;

/** Consulta daqui a 3 h (dentro das 24 h: o lembrete sai na hora) com WhatsApp autorizado. */
async function consultaComLembreteEnviado(admin, telefone) {
  const p = await criarProfissional(admin, 'Dra. WhatsApp');
  const cpf = cpfFicticio();
  const c = await api('agendamento/consultas', { token: admin, body: { nome: 'Paciente Fictício US30', cpf, telefone, profissional: p.nome, especialidade: p.especialidade, inicio: new Date(Date.now() + 3 * 3_600_000).toISOString() } });
  assert.equal(c.status, 201, JSON.stringify(c.dados));
  const lista = await aguardar(() => api(`cadastro/pacientes?busca=${cpf}`, { token: admin }).then((r) => r.dados), (d) => d.pacientes?.length === 1, 'paciente no mestre');
  assert.equal((await api(`cadastro/pacientes/${lista.pacientes[0].id}/autorizacoes`, { token: admin, body: { canal: 'whatsapp', situacao: 'autorizado', origem: 'presencial' } })).status, 201);
  await aguardar(() => api(`notificacao/lembretes?consulta=${c.dados.id}`, { token: admin }).then((r) => r.dados[0]), (l) => l?.status === 'simulado', 'lembrete enviado (simulado)', 60_000);
  return c.dados;
}
const responder = (admin, telefone, texto, idMensagem) => api('notificacao/demo/whatsapp/resposta', { token: admin, body: { telefone, texto, ...(idMensagem ? { idMensagem } : {}) } });

test('US-30: "sim" confirma a consulta no Agendamento; outras respostas não', async () => {
  const admin = await entrarAdmin();
  const telefone = telefoneUnico();
  const consulta = await consultaComLembreteEnviado(admin, telefone);

  const duvida = await responder(admin, `55${telefone}`, 'Posso remarcar?');
  assert.deepEqual({ resultado: duvida.dados.resultado, idConsulta: duvida.dados.idConsulta }, { resultado: 'nao_reconhecida', idConsulta: consulta.id });
  assert.equal((await api(`agendamento/consultas/${consulta.id}`, { token: admin })).dados.status, 'agendada');

  const idMensagem = `wamid.${randomUUID()}`;
  const sim = await responder(admin, `55${telefone}`, 'Sim', idMensagem);
  assert.equal(sim.dados.resultado, 'confirmada'); assert.equal(sim.dados.idConsulta, consulta.id);
  const confirmada = await aguardar(() => api(`agendamento/consultas/${consulta.id}`, { token: admin }).then((r) => r.dados), (c) => c.status === 'confirmada', 'confirmação no Agendamento');
  assert.equal(confirmada.confirmadaPor, 'whatsapp');

  // A Meta reentrega a mesma mensagem: nada muda.
  const repetida = await responder(admin, `55${telefone}`, 'Sim', idMensagem);
  assert.equal(repetida.dados.duplicada, true);
  const atividades = (await api('notificacao/atividades?limite=100', { token: admin })).dados.filter((a) => a.idConsulta === consulta.id);
  assert.equal(atividades.filter((a) => a.acao === 'lembrete.confirmado').length, 1);
  assert.ok(atividades.every((a) => !a.descricao.includes(telefone)), 'sem telefone nas atividades');

  // Telefone sem lembrete enviado para consulta futura.
  assert.equal((await responder(admin, `55${telefoneUnico()}`, 'Sim')).dados.resultado, 'sem_consulta');
});

test('US-30: consulta cancelada depois do lembrete não é confirmada', async () => {
  const admin = await entrarAdmin();
  const telefone = telefoneUnico();
  const consulta = await consultaComLembreteEnviado(admin, telefone);
  assert.equal((await api(`agendamento/consultas/${consulta.id}`, { token: admin, method: 'DELETE' })).status, 200);
  await aguardar(() => api(`notificacao/lembretes?consulta=${consulta.id}`, { token: admin }).then((r) => r.dados[0]), (l) => !!l.consultaCanceladaEm && l.status === 'simulado', 'cancelamento registrado no lembrete já enviado');
  assert.equal((await responder(admin, telefone, '1')).dados.resultado, 'sem_consulta');
  assert.equal((await api(`agendamento/consultas/${consulta.id}`, { token: admin })).dados.status, 'cancelada');
});

test('US-30: webhook público só aceita mensagem assinada pela Meta', async () => {
  const segredo = process.env.WHATSAPP_APP_SECRET, verificacao = process.env.WHATSAPP_VERIFY_TOKEN;
  const url = `${base}/api/notificacao/whatsapp/webhook`;
  const enviar = (corpo, assinatura) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(assinatura ? { 'X-Hub-Signature-256': assinatura } : {}) }, body: corpo });
  if (!segredo || !verificacao) {
    assert.equal((await enviar('{}')).status, 404, 'sem configuração, o webhook fica desligado');
    return;
  }
  const desafio = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verificacao)}&hub.challenge=12345`);
  assert.equal(desafio.status, 200); assert.equal(await desafio.text(), '12345');
  assert.equal((await fetch(`${url}?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`)).status, 403);

  const admin = await entrarAdmin();
  const telefone = telefoneUnico();
  const consulta = await consultaComLembreteEnviado(admin, telefone);
  const corpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: `wamid.${randomUUID()}`, from: `55${telefone}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'confirmo' } }] } }] }] });
  assert.equal((await enviar(corpo)).status, 401, 'sem assinatura');
  assert.equal((await enviar(corpo, `sha256=${createHmac('sha256', 'segredo-errado').update(corpo).digest('hex')}`)).status, 401);
  assert.equal((await api(`agendamento/consultas/${consulta.id}`, { token: admin })).dados.status, 'agendada');
  assert.equal((await enviar(corpo, `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`)).status, 200);
  await aguardar(() => api(`agendamento/consultas/${consulta.id}`, { token: admin }).then((r) => r.dados), (c) => c.status === 'confirmada', 'confirmação pelo webhook');
});
