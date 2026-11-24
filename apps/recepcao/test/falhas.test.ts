import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { cancelarConsulta } from '../src/agenda/cancelamento';
import { classificarFalha, descreverFalha, ErroApi, requisitar } from '../src/api/http';

const timeout = () => new DOMException('signal timed out', 'TimeoutError');

describe('classificarFalha (US-18-T1)', () => {
  for (const status of [400, 404, 409, 500, 503]) {
    test(`HTTP ${status}: o serviço respondeu e recusou`, () => assert.equal(classificarFalha(new ErroApi(status, 'x')), 'recusada'));
  }
  for (const status of [502, 504]) {
    test(`HTTP ${status} do gateway: resultado incerto`, () => assert.equal(classificarFalha(new ErroApi(status, 'x')), 'incerta'));
  }
  test('rede e tempo esgotado: resultado incerto', () => {
    assert.equal(classificarFalha(new TypeError('Failed to fetch')), 'incerta');
    assert.equal(classificarFalha(timeout()), 'incerta');
  });
  test('mensagens legíveis, sem texto técnico do navegador', () => {
    assert.equal(descreverFalha(new ErroApi(404, 'Consulta não encontrada'), 'o cancelamento'),
      'Não foi possível concluir o cancelamento: Consulta não encontrada.');
    const incerta = descreverFalha(timeout(), 'o cancelamento');
    assert.match(incerta, /não foi possível confirmar se o cancelamento aconteceu/);
    assert.match(incerta, /antes de repetir/);
    assert.doesNotMatch(incerta, /timed out/);
  });
});

describe('cancelarConsulta (US-18 CA1)', () => {
  const agora = () => 42;

  test('sucesso: confirmado pelo Agendamento', async () => {
    assert.deepEqual(await cancelarConsulta(async () => ({}), 'c1', agora), { fase: 'confirmada', em: 42 });
  });
  test('rejeição do serviço é capturada e informada como falha, sem confirmação', async () => {
    const r = await cancelarConsulta(() => Promise.reject(new ErroApi(500, 'Erro interno')), 'c1', agora);
    assert.deepEqual(r, { fase: 'falhou', mensagem: 'Não foi possível concluir o cancelamento: Erro interno.' });
  });
  test('sem resposta: incerto, sem afirmar sucesso nem falha', async () => {
    const r = await cancelarConsulta(() => Promise.reject(new TypeError('Failed to fetch')), 'c1', agora);
    assert.equal(r.fase, 'incerta');
    assert.equal((r as { em: number }).em, 42);
  });
  test('409 "já cancelada": a consulta está cancelada', async () => {
    const r = await cancelarConsulta(() => Promise.reject(new ErroApi(409, 'Consulta já cancelada')), 'c1', agora);
    assert.deepEqual(r, { fase: 'confirmada', em: 42, observacao: 'a consulta já estava cancelada' });
  });
  test('nunca rejeita, mesmo com erro inesperado', async () => {
    await assert.doesNotReject(cancelarConsulta(() => { throw new Error('síncrono'); }, 'c1'));
  });
});

describe('requisitar', () => {
  const fetchOriginal = globalThis.fetch;
  afterEach(() => { globalThis.fetch = fetchOriginal; });

  test('aplica timeout padrão quando ninguém passa sinal (polling não fica preso)', async () => {
    let recebido: AbortSignal | null | undefined;
    globalThis.fetch = async (_url, opcoes) => {
      recebido = opcoes?.signal;
      return new Response('[]', { status: 200 });
    };
    await requisitar('/x');
    assert.ok(recebido instanceof AbortSignal);
  });
  test('preserva o sinal de quem chama', async () => {
    const controle = new AbortController();
    let recebido: AbortSignal | null | undefined;
    globalThis.fetch = async (_url, opcoes) => {
      recebido = opcoes?.signal;
      return new Response('{}', { status: 200 });
    };
    await requisitar('/x', { signal: controle.signal });
    assert.equal(recebido, controle.signal);
  });
  test('erro HTTP vira ErroApi com a mensagem do serviço', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ erro: 'Consulta não encontrada' }), { status: 404 });
    await assert.rejects(requisitar('/x'), (e: unknown) => e instanceof ErroApi && e.status === 404 && e.message === 'Consulta não encontrada');
  });
});
