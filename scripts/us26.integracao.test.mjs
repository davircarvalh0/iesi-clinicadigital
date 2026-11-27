// US-26: profissionais, disponibilidade semanal, horários livres e conflito de horário no PostgreSQL.
import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';

const projeto = process.env.COMPOSE_PROJECT_NAME;
if (!projeto || projeto === 'iesi-clinicadigital' || process.env.TEST_CONTROLS !== 'true') throw new Error('Execute exclusivamente no Compose isolado de testes.');
const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';

async function api(rota, { token, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const r = await fetch(`${base}/api/${rota}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  return { status: r.status, dados: r.status === 204 ? null : await r.json().catch(() => null) };
}
async function entrar(email, senha) {
  const r = await api('cadastro/usuarios/login', { body: { email, senha } });
  assert.equal(r.status, 200); return r.dados.token;
}
async function usuario(admin, perfil, profissionalId) {
  const email = `${randomUUID()}@teste.invalid`, senha = randomBytes(18).toString('base64url');
  assert.equal((await api('cadastro/usuarios', { token: admin, body: { nome: `Teste ${perfil}`, email, senha, perfil, ...(profissionalId ? { profissionalId } : {}) } })).status, 201);
  return entrar(email, senha);
}
const cpf = () => `000${String(randomInt(100_000_000)).padStart(8, '0')}`;
/** Próxima segunda-feira daqui a 3+ semanas (AAAA-MM-DD), longe de outras suítes. */
function segundaFutura() {
  const d = new Date(Date.now() + (21 + randomInt(200)) * 86_400_000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}
const as = (dia, hhmm) => `${dia}T${hhmm}:00-03:00`;

test('US-26: cadastro, edição, situação e disponibilidade do profissional', async () => {
  const admin = await entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
  const recepcao = await usuario(admin, 'recepcionista');
  const criado = await api('agendamento/profissionais', { token: admin, body: { nome: `Dra. Teste ${randomUUID()}`, especialidade: 'Teste' } });
  assert.equal(criado.status, 201); assert.equal(criado.dados.ativo, true); assert.equal(criado.dados.duracaoConsultaMinutos, 30);
  const id = criado.dados.id;
  const proprio = await usuario(admin, 'profissional', id);

  assert.equal((await api(`agendamento/profissionais/${id}`, { token: recepcao })).status, 200);
  assert.equal((await api(`agendamento/profissionais/${id}`, { token: proprio })).status, 200, 'o próprio profissional');
  assert.equal((await api(`agendamento/profissionais/${randomUUID()}`, { token: admin })).status, 404);
  assert.equal((await api(`agendamento/profissionais/${id}`, { token: recepcao, method: 'PATCH', body: { especialidade: 'Outra' } })).status, 403);
  const editado = await api(`agendamento/profissionais/${id}`, { token: admin, method: 'PATCH', body: { especialidade: 'Cardiologia', duracaoConsultaMinutos: 45 } });
  assert.equal(editado.status, 200); assert.equal(editado.dados.especialidade, 'Cardiologia'); assert.equal(editado.dados.duracaoConsultaMinutos, 45);
  assert.equal((await api(`agendamento/profissionais/${id}`, { token: admin, method: 'PATCH', body: { duracaoConsultaMinutos: 2 } })).status, 400);

  const semana = { duracaoConsultaMinutos: 60, intervalos: [{ diaSemana: 1, inicio: '08:00', fim: '12:00' }, { diaSemana: 1, inicio: '14:00', fim: '16:00' }, { diaSemana: 3, inicio: '09:00', fim: '11:00' }] };
  assert.equal((await api(`agendamento/profissionais/${id}/disponibilidade`, { token: recepcao, method: 'PUT', body: semana })).status, 403);
  for (const invalida of [
    { intervalos: [{ diaSemana: 1, inicio: '10:00', fim: '09:00' }] },
    { intervalos: [{ diaSemana: 1, inicio: '08:00', fim: '12:00' }, { diaSemana: 1, inicio: '11:00', fim: '13:00' }] },
    { intervalos: [{ diaSemana: 7, inicio: '08:00', fim: '12:00' }] },
    { intervalos: [{ diaSemana: 1, inicio: '8h', fim: '12:00' }] },
  ]) assert.equal((await api(`agendamento/profissionais/${id}/disponibilidade`, { token: admin, method: 'PUT', body: invalida })).status, 400, JSON.stringify(invalida));
  const salva = await api(`agendamento/profissionais/${id}/disponibilidade`, { token: admin, method: 'PUT', body: semana });
  assert.equal(salva.status, 200);
  const lida = await api(`agendamento/profissionais/${id}/disponibilidade`, { token: proprio });
  assert.deepEqual(lida.dados, { profissionalId: id, ...semana });

  const dia = segundaFutura();
  const horarios = await api(`agendamento/consultas/horarios-disponiveis?profissionalId=${id}&data=${dia}&dias=3`, { token: recepcao });
  assert.equal(horarios.status, 200);
  const quarta = new Date(new Date(`${dia}T12:00:00Z`).getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  assert.deepEqual(horarios.dados.horarios, [
    ...['08:00', '09:00', '10:00', '11:00', '14:00', '15:00'].map((h) => new Date(as(dia, h)).toISOString()),
    ...['09:00', '10:00'].map((h) => new Date(as(quarta, h)).toISOString()),
  ], 'segunda (dois turnos), terça sem agenda, quarta');

  // Inativo: some dos horários e não recebe novas consultas.
  assert.equal((await api(`agendamento/profissionais/${id}/status`, { token: admin, method: 'PATCH', body: { ativo: false } })).dados.ativo, false);
  assert.deepEqual((await api(`agendamento/consultas/horarios-disponiveis?profissionalId=${id}&data=${dia}`, { token: recepcao })).dados.horarios, []);
  const recusada = await api('agendamento/consultas', { token: recepcao, body: { nome: 'Paciente Fictício US26', cpf: cpf(), telefone: '81900000026', profissional: criado.dados.nome, especialidade: 'Cardiologia', inicio: as(dia, '08:00') } });
  assert.equal(recusada.status, 409);
});

test('US-26: conflito de horário, inclusive com pedidos simultâneos (PostgreSQL)', async () => {
  const admin = await entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
  const p = (await api('agendamento/profissionais', { token: admin, body: { nome: `Dr. Conflito ${randomUUID()}`, especialidade: 'Teste', duracaoConsultaMinutos: 30 } })).dados;
  const dia = segundaFutura();
  const marcar = (inicio) => api('agendamento/consultas', { token: admin, body: { nome: 'Paciente Fictício US26', cpf: cpf(), telefone: '81900000026', profissional: p.nome, especialidade: p.especialidade, inicio } });

  const primeira = await marcar(as(dia, '09:00'));
  assert.equal(primeira.status, 201); assert.equal(primeira.dados.duracaoMinutos, 30);
  assert.equal((await marcar(as(dia, '09:00'))).status, 409, 'mesmo horário');
  assert.equal((await marcar(as(dia, '09:15'))).status, 409, 'sobreposição parcial');
  assert.equal((await marcar(as(dia, '08:45'))).status, 409, 'termina dentro');
  assert.equal((await marcar(as(dia, '09:30'))).status, 201, 'encostada no fim');

  // Remarcar para cima de outra é recusado; para o próprio horário, não.
  const r = await api(`agendamento/consultas/${primeira.dados.id}`, { token: admin, method: 'PATCH', body: { inicio: as(dia, '09:40') } });
  assert.equal(r.status, 409);
  assert.equal((await api(`agendamento/consultas/${primeira.dados.id}`, { token: admin, method: 'PATCH', body: { inicio: as(dia, '09:00') } })).status, 200);

  // Cancelada libera o horário.
  assert.equal((await api(`agendamento/consultas/${primeira.dados.id}`, { token: admin, method: 'DELETE' })).status, 200);
  assert.equal((await marcar(as(dia, '09:00'))).status, 201);

  // 8 pedidos ao mesmo tempo para o mesmo horário: exatamente um é aceito.
  const resultados = await Promise.all(Array.from({ length: 8 }, () => marcar(as(dia, '11:00'))));
  assert.deepEqual(resultados.map((x) => x.status).sort(), [201, 409, 409, 409, 409, 409, 409, 409]);
  const agenda = (await api('agendamento/consultas', { token: admin })).dados.filter((c) => c.profissionalId === p.id && c.status !== 'cancelada');
  assert.equal(agenda.filter((c) => c.inicio === new Date(as(dia, '11:00')).toISOString()).length, 1);
});

test('US-26: profissional não lê a agenda de outro nem altera cadastros', async () => {
  const admin = await entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
  const a = (await api('agendamento/profissionais', { token: admin, body: { nome: `Dr. A ${randomUUID()}`, especialidade: 'Teste' } })).dados;
  const b = (await api('agendamento/profissionais', { token: admin, body: { nome: `Dr. B ${randomUUID()}`, especialidade: 'Teste' } })).dados;
  const token = await usuario(admin, 'profissional', a.id);
  assert.equal((await api(`agendamento/profissionais/${b.id}`, { token })).status, 403);
  assert.equal((await api(`agendamento/profissionais/${b.id}/disponibilidade`, { token })).status, 403);
  assert.equal((await api('agendamento/profissionais', { token })).status, 403);
  assert.equal((await api(`agendamento/profissionais/${a.id}/disponibilidade`, { token, method: 'PUT', body: { intervalos: [] } })).status, 403);
  assert.equal((await api(`agendamento/consultas/horarios-disponiveis?profissionalId=${a.id}&data=2030-01-07`, { token })).status, 403);
  assert.equal((await api('agendamento/eventos', { token })).status, 403);
});
