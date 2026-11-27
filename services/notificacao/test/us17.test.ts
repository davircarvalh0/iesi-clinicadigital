import assert from 'node:assert/strict';
import { verificarAcesso } from '@clinica/eventos';
import { fetch } from '../../../packages/eventos/test/http-autenticado';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';


let base = '';
let servidor: Server;
before(async () => {
  // A configuração exige RABBITMQ_URL ao ser carregada; nenhuma conexão é aberta nestes testes.
  process.env.RABBITMQ_URL ??= 'amqp://teste:teste@localhost:5672';
  process.env.TEST_CONTROLS = 'true';
  const { criarApp } = await import('../src/app');
  await new Promise<void>((resolve) => {
    servidor = criarApp(verificarAcesso).listen(0, () => {
      base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
      resolve();
    });
  });
});
after(() => new Promise<void>((resolve) => servidor.close(() => resolve())));

async function chamar(rota: string, init: RequestInit = {}) {
  const resposta = await fetch(`${base}${rota}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  return { status: resposta.status, corpo: await resposta.json() as { erro?: string } };
}

test('CA3: limite negativo, zero ou não numérico em /atividades é rejeitado sem erro interno', async () => {
  for (const limite of ['-5', '0', '1.5', 'abc', '']) {
    const resposta = await chamar(`/atividades?limite=${limite}`);
    assert.equal(resposta.status, 400, `limite=${limite}`);
    assert.match(resposta.corpo.erro ?? '', /Limite inválido/);
  }
});

test('JSON malformado nas rotas de demonstração é erro de validação, não erro interno', async () => {
  const resposta = await chamar('/demo/consumo', { method: 'PUT', body: '{"ativo": ' });
  assert.equal(resposta.status, 400);
  assert.equal(resposta.corpo.erro, 'JSON inválido');
});

test('corpo inválido nas rotas de demonstração responde 400 com mensagem', async () => {
  const resposta = await chamar('/demo/consumo', { method: 'PUT', body: JSON.stringify({ ativo: 'sim' }) });
  assert.equal(resposta.status, 400);
  assert.match(resposta.corpo.erro ?? '', /^Dados inválidos/);
});
