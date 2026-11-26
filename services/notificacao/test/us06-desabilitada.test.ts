import assert from 'node:assert/strict';
import { tokenTeste } from '../../../packages/eventos/test/http-autenticado';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

let base = '';
let servidor: Server;
before(async () => {
  process.env.RABBITMQ_URL ??= 'amqp://teste:teste@localhost:5672';
  delete process.env.OPERACAO_HABILITADA;
  delete process.env.TEST_CONTROLS;
  const { criarApp } = await import('../src/app');
  await new Promise<void>((resolve) => {
    servidor = criarApp().listen(0, () => {
      base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
      resolve();
    });
  });
});
after(() => new Promise<void>((resolve) => servidor.close(() => resolve())));

test('rotas /operacao exigem autenticação e perfil administrativo', async () => {
  for (const [metodo, rota] of [['GET', '/operacao/erros'], ['POST', '/operacao/erros/x/reprocessar'], ['GET', '/operacao/reprocessamentos']]) {
    const resposta = await fetch(`${base}${rota}`, { method: metodo });
    assert.equal(resposta.status, 401, `${metodo} ${rota}`);
    const restrita = await fetch(`${base}${rota}`, { method: metodo, headers: { Authorization: `Bearer ${tokenTeste('recepcionista')}` } });
    assert.equal(restrita.status, 403, `${metodo} ${rota}`);
  }
  assert.equal((await fetch(`${base}/saude`)).status, 200);
  assert.equal((await fetch(`${base}/demo/consumo`, { headers: { Authorization: `Bearer ${tokenTeste()}` } })).status, 404);
});
