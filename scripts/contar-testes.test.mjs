import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contarTestes } from './contar-testes.mjs';

test('US-20: soma os blocos de vários workspaces e distingue pulados e falhas', () => {
  const saida = ['ℹ tests 8', 'ℹ pass 8', 'ℹ fail 0', 'ℹ skipped 0', 'outra linha', 'ℹ tests 15', 'ℹ pass 12', 'ℹ fail 1', 'ℹ skipped 2'].join('\n');
  assert.deepEqual(contarTestes(saida), { total: 23, pass: 20, fail: 1, skipped: 2 });
});

test('US-20: sem bloco do node --test não há contagem (comandos que não são testes)', () => {
  assert.equal(contarTestes('Container healthy\nbuilt in 1s'), null);
  assert.equal(contarTestes('texto com ℹ tests 3 no meio da linha'), null);
});
