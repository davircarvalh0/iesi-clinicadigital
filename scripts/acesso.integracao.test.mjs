import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';

const projeto = process.env.COMPOSE_PROJECT_NAME;
if (!projeto || projeto === 'iesi-clinicadigital' || process.env.TEST_CONTROLS !== 'true') throw new Error('Execute exclusivamente no Compose isolado de testes.');
const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';
async function api(rota, { token, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const r = await fetch(`${base}/api/${rota}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) });
  return { status: r.status, dados: await r.json().catch(() => null) };
}
async function entrar(email, senha) {
  const r = await api('cadastro/usuarios/login', { body: { email, senha } });
  assert.equal(r.status, 200); return r.dados.token;
}
test('login obrigatório, papéis e agenda profissional isolada', async () => {
  for (const rota of ['agendamento/consultas', 'cadastro/pacientes', 'notificacao/lembretes', 'notificacao/operacao/erros']) {
    assert.equal((await api(rota)).status, 401);
  }
  const token = await entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
  const sufixo = randomUUID();
  const criarProf = async nome => {
    const r = await api('agendamento/profissionais', { token, body: { nome, especialidade: 'Teste' } });
    assert.equal(r.status, 201); return r.dados;
  };
  const p1 = await criarProf(`Profissional A ${sufixo}`), p2 = await criarProf(`Profissional B ${sufixo}`);
  async function criarUsuario(perfil, profissionalId) {
    const email = `${randomUUID()}@teste.invalid`, senha = randomBytes(24).toString('hex');
    const r = await api('cadastro/usuarios', { token, body: { nome: `Usuário ${perfil}`, email, senha, perfil, ...(profissionalId ? { profissionalId } : {}) } });
    assert.equal(r.status, 201); assert.ok(!('senhaHash' in r.dados));
    return entrar(email, senha);
  }
  const recepcao = await criarUsuario('recepcionista');
  const profissional = await criarUsuario('profissional', p1.id);
  assert.equal((await api('cadastro/usuarios', { token: recepcao })).status, 403);
  assert.equal((await api('notificacao/operacao/erros', { token: recepcao })).status, 403);
  assert.equal((await api('cadastro/pacientes', { token: profissional })).status, 403);
  assert.equal((await api('agendamento/profissionais', { token: recepcao, body: { nome: 'Sem permissão', especialidade: 'Teste' } })).status, 403);
  const agendar = async p => {
    const cpf = `000${String(Number.parseInt(randomBytes(4).toString('hex'), 16) % 100000000).padStart(8, '0')}`;
    const r = await api('agendamento/consultas', { token: recepcao, body: { nome: 'Paciente Exemplo', cpf, telefone: '81900000001', profissional: p.nome, especialidade: p.especialidade, inicio: new Date(Date.now() + 86_400_000 * 7).toISOString() } });
    assert.equal(r.status, 201); return r.dados.id;
  };
  const propria = await agendar(p1), outra = await agendar(p2);
  const agenda = await api('agendamento/consultas', { token: profissional });
  assert.equal(agenda.status, 200);
  assert.deepEqual(agenda.dados.map(c => c.id), [propria]);
  assert.equal((await api(`agendamento/consultas/${outra}`, { token: profissional, method: 'DELETE' })).status, 403);
});
