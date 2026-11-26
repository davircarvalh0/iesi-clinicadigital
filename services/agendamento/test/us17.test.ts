import assert from 'node:assert/strict';
import { fetch } from '../../../packages/eventos/test/http-autenticado';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

import { esquemaNovaConsulta, esquemaRemarcacao } from '../src/consultas/validacao';

const valida = {
  nome: 'Paciente Fictício US17', cpf: '000.123.456-78', telefone: '(81) 90000-0017',
  profissional: 'Profissional Fictício', especialidade: 'Teste', inicio: '2026-12-01T10:00:00-03:00',
};

let base = '';
let servidor: Server;
before(async () => {
  // A configuração exige RABBITMQ_URL ao ser carregada; nenhuma conexão é aberta nestes testes.
  process.env.RABBITMQ_URL ??= 'amqp://teste:teste@localhost:5672';
  const { criarApp } = await import('../src/app');
  await new Promise<void>((resolve) => {
    servidor = criarApp().listen(0, () => {
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

test('CPF e telefone válidos são normalizados para dígitos', () => {
  const consulta = esquemaNovaConsulta.parse(valida);
  assert.equal(consulta.cpf, '00012345678');
  assert.equal(consulta.telefone, '81900000017');
  assert.equal(esquemaNovaConsulta.parse({ ...valida, cpf: '00012345678', telefone: '5581900000017' }).telefone, '5581900000017');
});

test('CA1: CPF fora do formato, telefone inválido e data inválida são rejeitados', () => {
  for (const cpf of ['abc12345678901', '000.123.456-7', '0001234567', '000123456789', '000-123-456.78', '']) {
    assert.equal(esquemaNovaConsulta.safeParse({ ...valida, cpf }).success, false, `cpf ${cpf}`);
  }
  for (const telefone of ['00000000000', '123', '81 9000', '819000000017777', 'abc']) {
    assert.equal(esquemaNovaConsulta.safeParse({ ...valida, telefone }).success, false, `telefone ${telefone}`);
  }
  for (const inicio of ['2026-02-30T10:00:00-03:00', '2026-13-01T10:00:00-03:00', '2026-12-01', 'ontem', '']) {
    assert.equal(esquemaNovaConsulta.safeParse({ ...valida, inicio }).success, false, `inicio ${inicio}`);
    assert.equal(esquemaRemarcacao.safeParse({ inicio }).success, false, `remarcação ${inicio}`);
  }
});

test('CA1: a API responde 400 com mensagem clara antes de tocar no banco', async () => {
  const cpf = await chamar('/consultas', { method: 'POST', body: JSON.stringify({ ...valida, cpf: 'abc12345678901' }) });
  assert.equal(cpf.status, 400);
  assert.match(cpf.corpo.erro ?? '', /CPF inválido/);

  const telefone = await chamar('/consultas', { method: 'POST', body: JSON.stringify({ ...valida, telefone: '123' }) });
  assert.equal(telefone.status, 400);
  assert.match(telefone.corpo.erro ?? '', /Telefone inválido/);

  const data = await chamar('/consultas', { method: 'POST', body: JSON.stringify({ ...valida, inicio: '2026-02-30T10:00:00-03:00' }) });
  assert.equal(data.status, 400);
  assert.match(data.corpo.erro ?? '', /Data e hora inválidas/);

  const remarcar = await chamar('/consultas/qualquer-id', { method: 'PATCH', body: JSON.stringify({ inicio: 'ontem' }) });
  assert.equal(remarcar.status, 400);

  const semCorpo = await chamar('/consultas', { method: 'POST' });
  assert.equal(semCorpo.status, 400);
});

test('CA1: JSON malformado é erro de validação, não erro interno', async () => {
  const resposta = await chamar('/consultas', { method: 'POST', body: '{"nome": ' });
  assert.equal(resposta.status, 400);
  assert.equal(resposta.corpo.erro, 'JSON inválido');
});

test('CA3: limite negativo, zero ou não numérico é rejeitado sem erro interno', async () => {
  for (const limite of ['-5', '0', '1.5', 'abc', '']) {
    const resposta = await chamar(`/eventos?limite=${limite}`);
    assert.equal(resposta.status, 400, `limite=${limite}`);
    assert.match(resposta.corpo.erro ?? '', /Limite inválido/);
  }
});
