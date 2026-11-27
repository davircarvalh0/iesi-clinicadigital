// US-28: estados da consulta (confirmada, concluida, falta) pela API real (Compose isolado de testes).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, as, cpfFicticio, criarConta, criarProfissional, entrarAdmin, segundaFutura } from './apoio-api.mjs';

async function marcar(token, p, inicio) {
  const r = await api('agendamento/consultas', { token, body: { nome: 'Paciente Fictício US28', cpf: cpfFicticio(), telefone: '81900000280', profissional: p.nome, especialidade: p.especialidade, inicio } });
  assert.equal(r.status, 201, JSON.stringify(r.dados)); return r.dados;
}
const situacao = (token, id, status) => api(`agendamento/consultas/${id}/status`, { token, method: 'PATCH', body: { status } });

test('US-28: confirmar antes; concluir ou registrar falta depois do início', async () => {
  const admin = await entrarAdmin();
  const p = await criarProfissional(admin);
  const futura = await marcar(admin, p, as(segundaFutura(), '09:00'));
  const passada = await marcar(admin, p, new Date(Date.now() - 2 * 3_600_000).toISOString());

  assert.equal((await situacao(admin, futura.id, 'cancelada')).status, 400, 'cancelar é pelo DELETE');
  assert.equal((await situacao(admin, futura.id, 'falta')).status, 409, 'falta antes do início');
  const confirmada = await situacao(admin, futura.id, 'confirmada');
  assert.equal(confirmada.status, 200); assert.equal(confirmada.dados.status, 'confirmada'); assert.equal(confirmada.dados.confirmadaPor, 'recepcao');

  // Remarcar desfaz a confirmação: ela valia para o horário antigo.
  const remarcada = await api(`agendamento/consultas/${futura.id}`, { token: admin, method: 'PATCH', body: { inicio: as(segundaFutura(), '10:00') } });
  assert.equal(remarcada.status, 200); assert.equal(remarcada.dados.status, 'agendada'); assert.equal(remarcada.dados.confirmadaEm, null);

  assert.equal((await situacao(admin, passada.id, 'confirmada')).status, 409, 'confirmar depois do início');
  const concluida = await situacao(admin, passada.id, 'concluida');
  assert.equal(concluida.status, 200); assert.equal(concluida.dados.status, 'concluida'); assert.ok(concluida.dados.encerradaEm);
  // Encerrada não volta: nem remarcar, nem cancelar, nem trocar para falta.
  assert.equal((await situacao(admin, passada.id, 'falta')).status, 409);
  assert.equal((await api(`agendamento/consultas/${passada.id}`, { token: admin, method: 'PATCH', body: { inicio: as(segundaFutura(), '11:00') } })).status, 409);
  assert.equal((await api(`agendamento/consultas/${passada.id}`, { token: admin, method: 'DELETE' })).status, 409);

  const cancelada = await marcar(admin, p, new Date(Date.now() - 4 * 3_600_000).toISOString());
  assert.equal((await api(`agendamento/consultas/${cancelada.id}`, { token: admin, method: 'DELETE' })).status, 200);
  assert.equal((await situacao(admin, cancelada.id, 'falta')).status, 409, 'cancelada não vira falta');
});

test('US-28: o profissional registra presença e falta só nas próprias consultas', async () => {
  const admin = await entrarAdmin();
  const p = await criarProfissional(admin, 'Dr. Presença'), outro = await criarProfissional(admin, 'Dr. Outro');
  const prof = await criarConta(admin, 'profissional', { profissionalId: p.id });
  const minha = await marcar(admin, p, new Date(Date.now() - 3_600_000).toISOString());
  const alheia = await marcar(admin, outro, new Date(Date.now() - 3_600_000).toISOString());
  const futura = await marcar(admin, p, as(segundaFutura(), '15:00'));
  assert.equal((await situacao(prof.token, alheia.id, 'falta')).status, 404);
  assert.equal((await situacao(prof.token, futura.id, 'confirmada')).status, 403, 'confirmação é da recepção ou do paciente');
  const falta = await situacao(prof.token, minha.id, 'falta');
  assert.equal(falta.status, 200); assert.equal(falta.dados.status, 'falta');
  const agenda = await api('agendamento/consultas', { token: prof.token });
  assert.equal(agenda.dados.find((c) => c.id === minha.id).status, 'falta');
});

test('US-28: horário de consulta encerrada continua ocupado; o de cancelada é liberado', async () => {
  const admin = await entrarAdmin();
  const p = await criarProfissional(admin);
  const inicio = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const c = await marcar(admin, p, inicio);
  assert.equal((await situacao(admin, c.id, 'concluida')).status, 200);
  assert.equal((await api('agendamento/consultas', { token: admin, body: { nome: 'Paciente Fictício US28', cpf: cpfFicticio(), telefone: '81900000280', profissional: p.nome, especialidade: p.especialidade, inicio } })).status, 409);
});
