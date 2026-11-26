import assert from 'node:assert/strict';
import { fetch } from '../../../packages/eventos/test/http-autenticado';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

const evento = {
  id_evento: 'evento-us06', tipo: 'consulta.agendada', versao: 1, origem: 'agendamento',
  ocorrido_em: '2026-11-23T10:00:00-03:00', id_correlacao: 'consulta-abc',
  payload: {
    id_consulta: 'abc',
    paciente: { cpf: '00011122233', nome: 'Sentinela Seis', telefone: '81988887777' },
    profissional: 'Profissional Fictício', especialidade: 'Teste', inicio: '2026-12-01T10:00:00-03:00',
  },
};
const mensagem = (conteudo: string, headers: Record<string, unknown> = {}) =>
  ({ content: Buffer.from(conteudo), properties: { headers } }) as never;

let base = '';
let servidor: Server;
before(async () => {
  // A configuração exige RABBITMQ_URL ao ser carregada; nenhuma conexão é aberta nestes testes.
  process.env.RABBITMQ_URL ??= 'amqp://teste:teste@localhost:5672';
  process.env.OPERACAO_HABILITADA = 'true';
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
  return { status: resposta.status, corpo: await resposta.json() as { erro?: string; detalhes?: unknown } };
}

test('CA1: o resumo traz tipo, id, tentativas e motivo, sem dados pessoais do payload', async () => {
  const { resumirMensagem } = await import('../src/reprocessamento/fila-erros');
  const resumo = resumirMensagem(mensagem(JSON.stringify(evento), {
    'x-tentativas': 3, 'x-motivo': 'falha no processamento após 3 tentativas (P1001)',
  }));
  assert.deepEqual(resumo, {
    idEvento: 'evento-us06', tipo: 'consulta.agendada', versao: 1, origem: 'agendamento',
    idCorrelacao: 'consulta-abc', idConsulta: 'abc', ocorridoEm: '2026-11-23T10:00:00-03:00',
    tentativas: 3, motivo: 'falha no processamento após 3 tentativas (P1001)', reprocessavel: true,
  });
  const texto = JSON.stringify(resumo);
  for (const sentinela of ['00011122233', 'Sentinela Seis', '81988887777', 'Profissional Fictício']) {
    assert.ok(!texto.includes(sentinela), `não deve expor ${sentinela}`);
  }
});

test('CA1: motivo e tipo com números longos são mascarados e mensagem ilegível não é reprocessável', async () => {
  const { resumirMensagem } = await import('../src/reprocessamento/fila-erros');
  const mascarado = resumirMensagem(mensagem(JSON.stringify({ ...evento, tipo: 'tipo 5581988887777' }), { 'x-motivo': 'erro para 81988887777' }));
  assert.equal(mascarado.tipo, 'tipo ***');
  assert.equal(mascarado.motivo, 'erro para ***');

  const ilegivel = resumirMensagem(mensagem('isto não é JSON 00011122233'));
  assert.equal(ilegivel.idEvento, null);
  assert.equal(ilegivel.reprocessavel, false);
  assert.equal(ilegivel.tentativas, 0);
  assert.ok(!JSON.stringify(ilegivel).includes('00011122233'));
});

test('a solicitação identifica o solicitante autenticado e valida limites', async () => {
  const semCorpo = await chamar('/operacao/erros/evento-us06/reprocessar', { method: 'POST' });
  assert.equal(semCorpo.status, 503);
  for (const limite of ['-1', '0', 'abc']) {
    assert.equal((await chamar(`/operacao/erros?limite=${limite}`)).status, 400, `limite=${limite}`);
    assert.equal((await chamar(`/operacao/reprocessamentos?limite=${limite}`)).status, 400, `limite=${limite}`);
  }
});

test('sem conexão com o broker a operação responde 503 e não registra reprocessamento', async () => {
  const lista = await chamar('/operacao/erros');
  assert.equal(lista.status, 503);
  const pedido = await chamar('/operacao/erros/evento-us06/reprocessar', {
    method: 'POST', body: JSON.stringify({ solicitante: 'Operadora Fictícia' }),
  });
  assert.equal(pedido.status, 503);
  assert.match(pedido.corpo.erro ?? '', /indisponível/);
});
