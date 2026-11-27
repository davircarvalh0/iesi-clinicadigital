import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { emitirAcesso, verificarAcesso } from '../dist/acesso.js';

test('a identidade exige uma sessão assinada; não aceita ausência de credenciais', () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  const usuario = { id: 'u1', nome: 'Recepção', perfil: 'recepcionista', profissionalId: null };
  const token = emitirAcesso(usuario);
  assert.deepEqual(verificarAcesso(`Bearer ${token}`), usuario);
  assert.equal(verificarAcesso(undefined), null);
  assert.equal(verificarAcesso('Bearer inválido'), null);
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  assert.equal(verificarAcesso(`Bearer ${token}`), null);
});

test('profissional deve ter vínculo com seu cadastro e token tem validade', (t) => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  const usuario = { id: 'u2', nome: 'Profissional', perfil: 'profissional', profissionalId: 'p1' };
  assert.deepEqual(verificarAcesso(`Bearer ${emitirAcesso(usuario)}`), usuario);
  assert.equal(verificarAcesso(`Bearer ${emitirAcesso({ ...usuario, profissionalId: null })}`), null);
  const token = emitirAcesso(usuario);
  const expirada = Date.now() + 31 * 60_000;
  t.mock.method(Date, 'now', () => expirada);
  assert.equal(verificarAcesso(`Bearer ${token}`), null);
  assert.throws(() => { delete process.env.AUTH_SECRET; emitirAcesso(usuario); });
});

test('US-25: o token do login carrega a sessão; sem sessão, a identidade continua igual', () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  const usuario = { id: 'u3', nome: 'Recepção', perfil: 'recepcionista', profissionalId: null };
  assert.deepEqual(verificarAcesso(`Bearer ${emitirAcesso(usuario, 's1')}`), { ...usuario, sessaoId: 's1' });
  assert.deepEqual(verificarAcesso(`Bearer ${emitirAcesso(usuario)}`), usuario);
});
