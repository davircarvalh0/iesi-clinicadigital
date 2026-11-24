import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

let base = '';
let servidor: Server;
before(async () => {
  process.env.RABBITMQ_URL ??= 'amqp://teste:teste@localhost:5672';
  delete process.env.OPERACAO_HABILITADA;
  const { criarApp } = await import('../src/app');
  await new Promise<void>((resolve) => {
    servidor = criarApp().listen(0, () => {
      base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
      resolve();
    });
  });
});
after(() => new Promise<void>((resolve) => servidor.close(() => resolve())));

test('fora do ambiente de demonstração as rotas /operacao não existem', async () => {
  for (const [metodo, rota] of [['GET', '/operacao/erros'], ['POST', '/operacao/erros/x/reprocessar'], ['GET', '/operacao/reprocessamentos']]) {
    const resposta = await fetch(`${base}${rota}`, { method: metodo });
    assert.equal(resposta.status, 404, `${metodo} ${rota}`);
  }
  assert.equal((await fetch(`${base}/saude`)).status, 200);
});
