// Apoio das suítes US-25 em diante: chamadas pela API real (gateway), login e cadastros fictícios.
import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const projeto = process.env.COMPOSE_PROJECT_NAME;
if (!projeto || projeto === 'iesi-clinicadigital' || process.env.TEST_CONTROLS !== 'true') throw new Error('Execute exclusivamente no Compose isolado de testes.');
const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';

// Fixture histórica exclusiva do Compose de testes: a API normal recusa datas passadas.
export function ajustarInicioHistorico(id, inicio) {
  assert.match(id, /^[0-9a-f-]{36}$/i);
  const data = new Date(inicio).toISOString();
  assert.ok(Date.parse(data) < Date.now());
  execFileSync('docker', ['compose', '-p', projeto, 'exec', '-T', 'db-agendamento', 'psql', '-U', 'agendamento', '-d', 'agendamento', '-v', 'ON_ERROR_STOP=1', '-c', `UPDATE consultas SET inicio = '${data}' WHERE id = '${id}'`], { encoding: 'utf8' });
}

// Simula o aceite de uma mensagem pelo provedor sem enviar mensagens reais.
export function registrarAceiteWhatsappFixture(idConsulta, idMensagem) {
  assert.match(idConsulta, /^[0-9a-f-]{36}$/i);
  assert.match(idMensagem, /^wamid\.[0-9a-f-]{36}$/i);
  const sql = `BEGIN; UPDATE lembretes SET status = 'aceito_provedor', id_externo = '${idMensagem}' WHERE id_consulta = '${idConsulta}' AND status = 'simulado'; UPDATE tentativas_envio SET resultado = 'aceito_provedor', id_externo = '${idMensagem}' WHERE id_consulta = '${idConsulta}' AND resultado = 'simulado'; COMMIT;`;
  execFileSync('docker', ['compose', '-p', projeto, 'exec', '-T', 'db-notificacao', 'psql', '-U', 'notificacao', '-d', 'notificacao', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
}

export async function api(rota, { token, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const r = await fetch(`${base}/api/${rota}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  return { status: r.status, dados: r.status === 204 ? null : await r.json().catch(() => null) };
}
export async function entrar(email, senha) {
  const r = await api('cadastro/usuarios/login', { body: { email, senha } });
  assert.equal(r.status, 200, JSON.stringify(r.dados)); return r.dados.token;
}
export const entrarAdmin = () => entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
export const senhaNova = () => randomBytes(18).toString('base64url');
export const cpfFicticio = () => `000${String(randomInt(100_000_000)).padStart(8, '0')}`;

export async function aguardar(carregar, condicao, descricao, prazoMs = 30_000) {
  const limite = Date.now() + prazoMs;
  while (Date.now() < limite) {
    const valor = await carregar().catch(() => undefined);
    if (valor !== undefined && condicao(valor)) return valor;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Tempo esgotado: ${descricao}`);
}

/** Cria a conta e devolve { id, email, senha, token }. */
export async function criarConta(tokenCriador, perfil, extras = {}) {
  const email = `${randomUUID()}@teste.invalid`, senha = senhaNova();
  const r = await api('cadastro/usuarios', { token: tokenCriador, body: { nome: `Teste ${perfil}`, email, senha, perfil, ...extras } });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  return { ...r.dados, email, senha, token: await entrar(email, senha) };
}

/** Profissional com segunda a sexta, 08:00–12:00 e 14:00–18:00, consultas de 30 min. */
export async function criarProfissional(admin, prefixo = 'Profissional US') {
  const r = await api('agendamento/profissionais', { token: admin, body: { nome: `${prefixo} ${randomUUID().slice(0, 8)}`, especialidade: 'Teste' } });
  assert.equal(r.status, 201);
  const intervalos = [1, 2, 3, 4, 5].flatMap((diaSemana) => [{ diaSemana, inicio: '08:00', fim: '12:00' }, { diaSemana, inicio: '14:00', fim: '18:00' }]);
  assert.equal((await api(`agendamento/profissionais/${r.dados.id}/disponibilidade`, { token: admin, method: 'PUT', body: { intervalos } })).status, 200);
  return r.dados;
}

/** Marca pela recepção e espera o paciente aparecer no cadastro mestre (vindo do evento). */
export async function pacienteComConsulta(admin, profissional, inicio, cpf = cpfFicticio()) {
  const consulta = await api('agendamento/consultas', { token: admin, body: { nome: 'Paciente Fictício Portal', cpf, telefone: '81900000270', profissional: profissional.nome, especialidade: profissional.especialidade, inicio } });
  assert.equal(consulta.status, 201, JSON.stringify(consulta.dados));
  const lista = await aguardar(() => api(`cadastro/pacientes?busca=${cpf}`, { token: admin }).then((r) => r.dados), (d) => d.pacientes?.length === 1, 'paciente no cadastro mestre');
  return { paciente: lista.pacientes[0], consulta: consulta.dados, cpf };
}

/** Uma segunda-feira (AAAA-MM-DD) entre 4 e 30 semanas à frente, sorteada para não colidir entre suítes. */
export function segundaFutura() {
  const d = new Date(Date.now() + (28 + randomInt(180)) * 86_400_000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}
export const as = (dia, hhmm) => new Date(`${dia}T${hhmm}:00-03:00`).toISOString();
