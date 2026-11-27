import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consultasDemo, cpfFicticio, cpfValido, CPFS_SEM_AUTORIZACAO_DEMO, PACIENTES_DEMO } from './dados-demo.mjs';

test('validador de CPF reconhece CPFs válidos conhecidos e recusa sequências', () => {
  assert.equal(cpfValido('52998224725'), true); // exemplo público de CPF válido
  assert.equal(cpfValido('11144477735'), true);
  assert.equal(cpfValido('11111111111'), false);
  assert.equal(cpfValido('5299822472'), false);
});

test('US-19 CA2: CPFs da carga são fictícios (dígito verificador inválido) e únicos', () => {
  for (let n = 1; n <= 999; n += 1) assert.equal(cpfValido(cpfFicticio(n)), false, `cpfFicticio(${n})`);
  const cpfs = PACIENTES_DEMO.map((p) => p.cpf);
  assert.equal(new Set(cpfs).size, cpfs.length);
  for (const cpf of cpfs) {
    assert.match(cpf, /^000000\d{5}$/);
    assert.equal(cpfValido(cpf), false);
  }
});

test('US-19 CA2: telefones e nomes da carga são identificáveis como fictícios', () => {
  for (const { telefone, nome } of PACIENTES_DEMO) {
    assert.match(telefone, /^8190000\d{4}$/);
    assert.match(nome, / Exemplo /);
  }
});

test('US-19 CA2: carga tem 6 consultas, 5 pacientes, 1 cancelamento e passa na validação da API', () => {
  const consultas = consultasDemo(Date.parse('2026-11-24T12:00:00Z'));
  assert.equal(consultas.length, 6);
  assert.equal(new Set(consultas.map((c) => c.cpf)).size, 5);
  assert.equal(consultas.filter((c) => c.cancelar).length, 1);
  assert.equal(consultas[0].inicio, '2026-11-25T08:30:00-03:00');
  assert.equal(consultas[5].inicio, '2026-11-27T15:30:00-03:00');
  for (const c of consultas) {
    assert.ok(c.nome.trim().length >= 3);
    assert.ok(c.telefone.length >= 10 && c.telefone.length <= 13);
    assert.ok(!Number.isNaN(Date.parse(c.inicio)));
  }
});

test('US-14: só um paciente da carga fica sem autorização, para a tela mostrar o bloqueio', () => {
  assert.equal(CPFS_SEM_AUTORIZACAO_DEMO.size, 1);
  const cpfs = new Set(PACIENTES_DEMO.map((p) => p.cpf));
  for (const cpf of CPFS_SEM_AUTORIZACAO_DEMO) assert.ok(cpfs.has(cpf));
});
