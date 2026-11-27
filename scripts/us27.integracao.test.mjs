// US-27: portal do paciente pela API real (Compose isolado de testes).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { aguardar, api, as, criarConta, criarProfissional, entrarAdmin, pacienteComConsulta, segundaFutura } from './apoio-api.mjs';

test('US-27: conta do paciente exige vínculo com o cadastro mestre', async () => {
  const admin = await entrarAdmin();
  const recepcao = await criarConta(admin, 'recepcionista');
  const p = await criarProfissional(admin);
  const { paciente } = await pacienteComConsulta(admin, p, as(segundaFutura(), '08:00'));

  assert.equal((await api('cadastro/usuarios', { token: recepcao.token, body: { nome: 'Teste', email: `${randomUUID()}@teste.invalid`, senha: 'senha-bem-longa-1', perfil: 'recepcionista' } })).status, 403, 'recepção só abre conta de paciente');
  assert.equal((await api('cadastro/usuarios', { token: recepcao.token, body: { nome: 'Teste', email: `${randomUUID()}@teste.invalid`, senha: 'senha-bem-longa-1', perfil: 'paciente' } })).status, 400, 'sem vínculo');
  assert.equal((await api('cadastro/usuarios', { token: recepcao.token, body: { nome: 'Teste', email: `${randomUUID()}@teste.invalid`, senha: 'senha-bem-longa-1', perfil: 'paciente', pacienteId: randomUUID() } })).status, 404);
  const conta = await criarConta(recepcao.token, 'paciente', { pacienteId: paciente.id });
  assert.equal(conta.pacienteId, paciente.id);
  assert.equal((await api('cadastro/usuarios', { token: admin, body: { nome: 'Teste', email: `${randomUUID()}@teste.invalid`, senha: 'senha-bem-longa-1', perfil: 'paciente', pacienteId: paciente.id } })).status, 409, 'uma conta por paciente');
  assert.equal((await api(`cadastro/usuarios/${conta.id}`, { token: admin, method: 'PATCH', body: { perfil: 'recepcionista' } })).status, 400, 'conta de paciente não muda de perfil');

  // O paciente não entra nas áreas da equipe.
  for (const rota of ['cadastro/pacientes', 'cadastro/usuarios', 'agendamento/consultas', 'agendamento/eventos', 'notificacao/lembretes', 'notificacao/atividades']) {
    assert.equal((await api(rota, { token: conta.token })).status, 403, rota);
  }
});

test('US-27: o paciente vê as próprias consultas, marca em horário livre e confirma', async () => {
  const admin = await entrarAdmin();
  const p = await criarProfissional(admin, 'Dra. Portal');
  const dia = segundaFutura();
  const { paciente, consulta: daRecepcao } = await pacienteComConsulta(admin, p, as(dia, '08:00'));
  const conta = await criarConta(admin, 'paciente', { pacienteId: paciente.id });
  const outro = await pacienteComConsulta(admin, p, as(dia, '08:30'));
  const token = conta.token;

  // A consulta marcada pela recepção aparece depois do vínculo (evento do cadastro).
  const minhas = await aguardar(() => api('agendamento/pacientes/minha-conta/consultas', { token }).then((r) => r.dados), (d) => d.length === 1, 'vínculo da consulta');
  assert.equal(minhas[0].id, daRecepcao.id);
  assert.ok(!('pacienteCpf' in minhas[0]) && !('pacienteTelefone' in minhas[0]));
  assert.equal((await api(`agendamento/consultas/${outro.consulta.id}`, { token })).status, 404, 'consulta de outro paciente');
  assert.equal((await api(`agendamento/consultas/${outro.consulta.id}/confirmar`, { token, method: 'PATCH', body: {} })).status, 404);

  const profissionais = await api('agendamento/profissionais', { token });
  assert.equal(profissionais.status, 200);
  assert.ok(profissionais.dados.some((x) => x.id === p.id)); assert.ok(profissionais.dados.every((x) => !('ativo' in x)));

  const livres = (await api(`agendamento/consultas/horarios-disponiveis?profissionalId=${p.id}&data=${dia}`, { token })).dados.horarios;
  assert.ok(!livres.includes(as(dia, '08:00')) && !livres.includes(as(dia, '08:30')), 'horários ocupados não aparecem');
  assert.equal(livres[0], as(dia, '09:00'));

  const solicitar = (inicio, profissionalId = p.id) => api('agendamento/consultas/solicitar', { token, body: { profissionalId, inicio } });
  const marcada = await solicitar(livres[0]);
  assert.equal(marcada.status, 201, JSON.stringify(marcada.dados));
  assert.equal(marcada.dados.status, 'agendada'); assert.equal(marcada.dados.profissional, p.nome);
  assert.equal((await solicitar(livres[0])).status, 409, 'horário tomado');
  assert.equal((await solicitar(as(dia, '09:10'))).status, 409, 'fora da grade');
  assert.equal((await solicitar(as(dia, '12:30'))).status, 409, 'fora da disponibilidade');
  assert.equal((await solicitar(new Date(Date.now() - 3_600_000).toISOString())).status, 400, 'passado');
  assert.equal((await api('agendamento/consultas/solicitar', { token, body: { profissionalId: p.id, inicio: livres[1], cpf: '00000000000' } })).status, 400, 'não aceita dados de contato no corpo');
  const detalhe = await api(`agendamento/consultas/${marcada.dados.id}`, { token: admin });
  assert.equal(detalhe.dados.idPaciente, paciente.id); assert.equal(detalhe.dados.pacienteCpf, paciente.cpf);

  // Limite de 3 consultas futuras marcadas: já são 2 (recepção + portal).
  assert.equal((await solicitar(livres[2])).status, 201);
  const excedente = await solicitar(livres[3]);
  assert.equal(excedente.status, 409); assert.match(excedente.dados.erro, /recepção/);

  const confirmada = await api(`agendamento/consultas/${marcada.dados.id}/confirmar`, { token, method: 'PATCH', body: {} });
  assert.equal(confirmada.status, 200); assert.equal(confirmada.dados.status, 'confirmada'); assert.equal(confirmada.dados.podeConfirmar, false);
  assert.equal((await api(`agendamento/consultas/${marcada.dados.id}/confirmar`, { token, method: 'PATCH', body: {} })).dados.status, 'confirmada', 'idempotente');
  assert.equal((await api(`agendamento/consultas/${marcada.dados.id}`, { token: admin })).dados.confirmadaPor, 'portal');
});

test('US-27: minha conta atualiza nome e telefone no cadastro mestre e nas consultas', async () => {
  const admin = await entrarAdmin();
  const p = await criarProfissional(admin);
  const { paciente, consulta } = await pacienteComConsulta(admin, p, as(segundaFutura(), '10:00'));
  const conta = await criarConta(admin, 'paciente', { pacienteId: paciente.id });
  const atualizada = await api('cadastro/usuarios/minha-conta', { token: conta.token, method: 'PATCH', body: { nome: 'Paciente Fictício Renomeado', telefone: '(81) 90000-0271' } });
  assert.equal(atualizada.status, 200); assert.equal(atualizada.dados.nome, 'Paciente Fictício Renomeado');
  const mestre = await api(`cadastro/pacientes/${paciente.id}`, { token: admin });
  assert.equal(mestre.dados.telefone, '81900000271'); assert.equal(mestre.dados.revisao, paciente.revisao + 1);
  await aguardar(() => api(`agendamento/consultas/${consulta.id}`, { token: admin }).then((r) => r.dados), (c) => c.pacienteTelefone === '81900000271', 'telefone propagado para a consulta');
  assert.equal((await api('cadastro/usuarios/minha-conta', { token: conta.token, method: 'PATCH', body: { perfil: 'administrador' } })).status, 400);

  const equipe = await criarConta(admin, 'recepcionista');
  assert.equal((await api('cadastro/usuarios/minha-conta', { token: equipe.token, method: 'PATCH', body: { telefone: '81900000272' } })).status, 400, 'telefone só na conta de paciente');
  assert.equal((await api('cadastro/usuarios/minha-conta', { token: equipe.token, method: 'PATCH', body: { nome: 'Recepção Renomeada' } })).dados.nome, 'Recepção Renomeada');
});
