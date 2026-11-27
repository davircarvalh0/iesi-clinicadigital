// US-29: indicadores do dashboard administrativo pela API real (Compose isolado de testes).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, cpfFicticio, criarConta, criarProfissional, entrarAdmin } from './apoio-api.mjs';

// Um dia passado e isolado (ano sorteado no futuro distante não serve: concluída exige início no passado).
const DIA = `2025-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;
const as = (hhmm) => new Date(`${DIA}T${hhmm}:00-03:00`).toISOString();

test('US-29: resumo e série refletem as situações das consultas do período', async () => {
  const admin = await entrarAdmin();
  const p = await criarProfissional(admin, 'Dra. Indicadores');
  const marcar = async (hhmm, cpf = cpfFicticio()) => {
    const r = await api('agendamento/consultas', { token: admin, body: { nome: 'Paciente Fictício US29', cpf, telefone: '81900000290', profissional: p.nome, especialidade: p.especialidade, inicio: as(hhmm) } });
    assert.equal(r.status, 201, JSON.stringify(r.dados)); return r.dados.id;
  };
  const situacao = (id, status) => api(`agendamento/consultas/${id}/status`, { token: admin, method: 'PATCH', body: { status } });
  const antes = (await api(`agendamento/indicadores/resumo?de=${DIA}&ate=${DIA}`, { token: admin })).dados;

  const mesmoPaciente = cpfFicticio();
  const [a, b, c, d, e] = [await marcar('08:00', mesmoPaciente), await marcar('09:00', mesmoPaciente), await marcar('10:00'), await marcar('11:00'), await marcar('23:30')];
  assert.equal((await situacao(a, 'concluida')).status, 200);
  assert.equal((await situacao(b, 'concluida')).status, 200);
  assert.equal((await situacao(c, 'falta')).status, 200);
  assert.equal((await api(`agendamento/consultas/${d}`, { token: admin, method: 'DELETE' })).status, 200);

  const r = await api(`agendamento/indicadores/resumo?de=${DIA}&ate=${DIA}`, { token: admin });
  assert.equal(r.status, 200);
  const delta = (campo) => r.dados.consultas[campo] - antes.consultas[campo];
  assert.deepEqual({ total: delta('total'), concluidas: delta('concluidas'), faltas: delta('faltas'), canceladas: delta('canceladas'), agendadas: delta('agendadas') },
    { total: 5, concluidas: 2, faltas: 1, canceladas: 1, agendadas: 1 });
  assert.ok(r.dados.pacientesCadastrados >= 4);
  assert.equal(r.dados.periodo.fuso, 'America/Recife');
  if (antes.consultas.total === 0) assert.deepEqual(r.dados.taxas, { comparecimento: 66.7, falta: 33.3, cancelamento: 20 });

  // 23:30 em Recife é 02:30 UTC do dia seguinte: conta no dia da clínica.
  const serie = await api(`agendamento/indicadores/consultas?de=${DIA}&ate=${DIA}`, { token: admin });
  assert.equal(serie.dados.porDia.length, 1);
  assert.equal(serie.dados.porDia[0].data, DIA);
  const doProfissional = serie.dados.porProfissional.find((x) => x.profissionalId === p.id);
  assert.deepEqual({ ...doProfissional }, { profissionalId: p.id, profissional: p.nome, agendada: 1, confirmada: 0, concluida: 2, cancelada: 1, falta: 1, total: 5 });
  assert.ok(e);
});

test('US-29: período padrão, validação e acesso só do administrador', async () => {
  const admin = await entrarAdmin();
  const padrao = await api('agendamento/indicadores/resumo', { token: admin });
  assert.equal(padrao.status, 200); assert.match(padrao.dados.periodo.de, /^\d{4}-\d{2}-01$/);
  const mes = await api('agendamento/indicadores/consultas?de=2026-02-01', { token: admin });
  assert.equal(mes.dados.periodo.ate, '2026-02-28'); assert.equal(mes.dados.porDia.length, 28);
  assert.equal((await api('agendamento/indicadores/resumo?de=2026-03-10&ate=2026-03-01', { token: admin })).status, 400);
  assert.equal((await api('agendamento/indicadores/resumo?de=2024-01-01&ate=2026-01-01', { token: admin })).status, 400);
  assert.equal((await api('agendamento/indicadores/resumo?de=ontem', { token: admin })).status, 400);
  const recepcao = await criarConta(admin, 'recepcionista');
  assert.equal((await api('agendamento/indicadores/resumo', { token: recepcao.token })).status, 403);
  assert.equal((await api('agendamento/indicadores/consultas')).status, 401);
});
