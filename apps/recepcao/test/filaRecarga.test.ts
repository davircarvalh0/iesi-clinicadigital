import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criarFilaRecarga } from '../src/hooks/filaRecarga';

/** Busca controlada pelo teste: cada chamada fica pendente até `concluir(i)`. */
function buscaControlada() {
  const pendentes: (() => void)[] = [];
  const buscar = () => new Promise<void>((resolve) => { pendentes.push(resolve); });
  return { buscar, chamadas: () => pendentes.length, concluir: (i: number) => pendentes[i]() };
}
const ciclo = () => new Promise((r) => setImmediate(r));

test('periódica não sobrepõe buscas', async () => {
  const b = buscaControlada();
  const fila = criarFilaRecarga(b.buscar);
  const p1 = fila.periodica();
  const p2 = fila.periodica();
  assert.equal(b.chamadas(), 1);
  assert.equal(p1, p2);
  b.concluir(0);
  await p1;
  void fila.periodica();
  assert.equal(b.chamadas(), 2);
});

test('forçada durante busca em curso faz uma busca nova depois dela (dado pós-gravação)', async () => {
  const b = buscaControlada();
  const fila = criarFilaRecarga(b.buscar);
  void fila.periodica(); // saiu antes da gravação
  let concluida = false;
  const forcada = fila.forcada().then(() => { concluida = true; });
  b.concluir(0);
  await ciclo();
  assert.equal(b.chamadas(), 2, 'iniciou uma busca nova');
  assert.equal(concluida, false, 'não resolve com a busca antiga');
  b.concluir(1);
  await forcada;
  assert.equal(concluida, true);
});

test('várias forçadas durante a mesma busca viram uma só busca seguinte', async () => {
  const b = buscaControlada();
  const fila = criarFilaRecarga(b.buscar);
  void fila.periodica();
  const a = fila.forcada();
  const c = fila.forcada();
  assert.equal(a, c);
  b.concluir(0);
  await ciclo();
  assert.equal(b.chamadas(), 2);
  b.concluir(1);
  await Promise.all([a, c]);
  assert.equal(b.chamadas(), 2);
});

test('forçada sem busca em curso busca já', async () => {
  const b = buscaControlada();
  const fila = criarFilaRecarga(b.buscar);
  void fila.forcada();
  assert.equal(b.chamadas(), 1);
});

test('busca que rejeita não trava a fila', async () => {
  let n = 0;
  const fila = criarFilaRecarga(async () => { n += 1; if (n === 1) throw new Error('falhou'); });
  const primeira = fila.periodica();
  const seguinte = fila.forcada();
  await assert.rejects(primeira);
  await seguinte;
  assert.equal(n, 2);
  await fila.forcada();
  assert.equal(n, 3);
});
