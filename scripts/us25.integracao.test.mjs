// US-25: sessões, senha e gestão de funcionários, pela API real no Compose isolado de testes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const projeto = process.env.COMPOSE_PROJECT_NAME;
if (!projeto || projeto === 'iesi-clinicadigital' || process.env.TEST_CONTROLS !== 'true') throw new Error('Execute exclusivamente no Compose isolado de testes.');
const base = process.env.TEST_BASE_URL ?? 'http://localhost:8080';

export async function api(rota, { token, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const r = await fetch(`${base}/api/${rota}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) });
  return { status: r.status, dados: r.status === 204 ? null : await r.json().catch(() => null) };
}
const login = (email, senha) => api('cadastro/usuarios/login', { body: { email, senha } });
async function entrar(email, senha) { const r = await login(email, senha); assert.equal(r.status, 200, JSON.stringify(r.dados)); return r.dados.token; }
const senhaNova = () => randomBytes(18).toString('base64url');

async function novoUsuario(admin, perfil = 'recepcionista') {
  const email = `${randomUUID()}@teste.invalid`, senha = senhaNova();
  const r = await api('cadastro/usuarios', { token: admin, body: { nome: `Funcionário ${perfil}`, email, senha, perfil } });
  assert.equal(r.status, 201); assert.equal(r.dados.ativo, true);
  return { ...r.dados, email, senha };
}
/**
 * O envio do código é simulado no log do Cadastro (não há serviço de e-mail no protótipo).
 * Com o Cadastro fora do Docker, aponte TEST_CADASTRO_LOG para o arquivo de log dele.
 */
function ultimoCodigoNoLog() {
  const log = process.env.TEST_CADASTRO_LOG
    ? readFileSync(process.env.TEST_CADASTRO_LOG, 'utf8')
    : execFileSync('docker', ['compose', '-p', projeto, 'logs', '--no-log-prefix', 'cadastro'], { encoding: 'utf8' });
  const codigos = [...log.matchAll(/recuperação de senha .*código ([A-Za-z0-9_-]+)/g)];
  return codigos.at(-1)?.[1];
}
const sessaoValida = async (token) => (await api('cadastro/usuarios/minha-conta/senha', { token, method: 'PATCH', body: {} })).status !== 401;

test('logout encerra a sessão no Cadastro', async () => {
  const admin = await entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
  const u = await novoUsuario(admin);
  const token = await entrar(u.email, u.senha);
  assert.equal((await api('cadastro/pacientes', { token })).status, 200);
  assert.equal((await api('cadastro/usuarios/logout', { token, method: 'POST' })).status, 204);
  assert.equal((await api('cadastro/pacientes', { token })).status, 401);
  assert.equal((await api('agendamento/consultas', { token })).status, 401);
  assert.equal((await api('notificacao/lembretes', { token })).status, 401);
  assert.equal((await api('cadastro/usuarios/logout', { method: 'POST' })).status, 401);
});

test('troca da própria senha confere a atual e derruba as outras sessões', async () => {
  const admin = await entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
  const u = await novoUsuario(admin);
  const aqui = await entrar(u.email, u.senha), outroComputador = await entrar(u.email, u.senha);
  const trocar = (body) => api('cadastro/usuarios/minha-conta/senha', { token: aqui, method: 'PATCH', body });
  const nova = senhaNova();
  assert.equal((await trocar({ senhaAtual: 'senha-errada-123', novaSenha: nova })).status, 400);
  assert.equal((await trocar({ senhaAtual: u.senha, novaSenha: 'curta' })).status, 400);
  assert.equal((await trocar({ senhaAtual: u.senha, novaSenha: nova })).status, 204);
  assert.equal(await sessaoValida(aqui), true);
  assert.equal(await sessaoValida(outroComputador), false);
  assert.equal((await login(u.email, u.senha)).status, 401);
  await entrar(u.email, nova);
});

test('recuperação de senha: resposta neutra, código de uso único e sessões encerradas', async () => {
  const admin = await entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
  const u = await novoUsuario(admin);
  const sessaoAntiga = await entrar(u.email, u.senha);
  const inexistente = await api('cadastro/usuarios/recuperar-senha', { body: { email: `${randomUUID()}@teste.invalid` } });
  const existente = await api('cadastro/usuarios/recuperar-senha', { body: { email: u.email } });
  assert.equal(inexistente.status, 202); assert.deepEqual(existente, inexistente);
  const codigo = ultimoCodigoNoLog();
  assert.ok(codigo, 'código no log do envio simulado');
  const nova = senhaNova();
  assert.equal((await api('cadastro/usuarios/redefinir-senha', { body: { codigo: 'x'.repeat(32), novaSenha: nova } })).status, 400);
  assert.equal((await api('cadastro/usuarios/redefinir-senha', { body: { codigo, novaSenha: nova } })).status, 204);
  assert.equal((await api('cadastro/usuarios/redefinir-senha', { body: { codigo, novaSenha: senhaNova() } })).status, 400, 'uso único');
  assert.equal(await sessaoValida(sessaoAntiga), false);
  await entrar(u.email, nova);
});

test('funcionários: só o administrador consulta, edita e desativa', async () => {
  const admin = await entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
  const u = await novoUsuario(admin), colega = await novoUsuario(admin);
  const tokenColega = await entrar(colega.email, colega.senha);
  for (const [rota, method, body] of [[`cadastro/usuarios/${u.id}`, 'GET'], [`cadastro/usuarios/${u.id}`, 'PATCH', { nome: 'Sem permissão' }], [`cadastro/usuarios/${u.id}/status`, 'PATCH', { ativo: false }]]) {
    assert.equal((await api(rota, { token: tokenColega, method, body })).status, 403, `${method} ${rota}`);
  }
  const detalhe = await api(`cadastro/usuarios/${u.id}`, { token: admin });
  assert.equal(detalhe.status, 200); assert.equal(detalhe.dados.email, u.email); assert.ok(!('senhaHash' in detalhe.dados));
  assert.equal((await api(`cadastro/usuarios/${randomUUID()}`, { token: admin })).status, 404);

  // Editar o nome mantém a sessão; mudar o perfil exige novo login.
  let token = await entrar(u.email, u.senha);
  const renomeado = await api(`cadastro/usuarios/${u.id}`, { token: admin, method: 'PATCH', body: { nome: 'Funcionário Renomeado' } });
  assert.equal(renomeado.status, 200); assert.equal(renomeado.dados.nome, 'Funcionário Renomeado');
  assert.equal(await sessaoValida(token), true);
  assert.equal((await api(`cadastro/usuarios/${u.id}`, { token: admin, method: 'PATCH', body: { perfil: 'profissional' } })).status, 400, 'profissional sem vínculo');
  assert.equal((await api(`cadastro/usuarios/${u.id}`, { token: admin, method: 'PATCH', body: { email: colega.email } })).status, 409);
  const promovido = await api(`cadastro/usuarios/${u.id}`, { token: admin, method: 'PATCH', body: { perfil: 'administrador' } });
  assert.equal(promovido.dados.perfil, 'administrador');
  assert.equal(await sessaoValida(token), false);
  token = await entrar(u.email, u.senha);
  assert.equal((await api('cadastro/usuarios', { token })).status, 200);

  // Desativar derruba a sessão e bloqueia o login; reativar devolve o acesso.
  const desativado = await api(`cadastro/usuarios/${u.id}/status`, { token: admin, method: 'PATCH', body: { ativo: false } });
  assert.equal(desativado.status, 200); assert.equal(desativado.dados.ativo, false);
  assert.equal(await sessaoValida(token), false);
  assert.equal((await login(u.email, u.senha)).status, 403);
  assert.equal((await api('cadastro/usuarios/recuperar-senha', { body: { email: u.email } })).status, 202);
  assert.equal((await api(`cadastro/usuarios/${u.id}/status`, { token: admin, method: 'PATCH', body: { ativo: true } })).status, 200);
  await entrar(u.email, u.senha);
});

test('ninguém desativa a própria conta', async () => {
  const admin = await entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_SENHA);
  const lista = await api('cadastro/usuarios', { token: admin });
  const eu = lista.dados.find((u) => u.email === process.env.ADMIN_EMAIL.toLowerCase());
  assert.equal((await api(`cadastro/usuarios/${eu.id}/status`, { token: admin, method: 'PATCH', body: { ativo: false } })).status, 409);
});
