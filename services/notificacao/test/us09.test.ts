// US-09: listagem dedicada de lembretes (GET /lembretes/painel).
import assert from 'node:assert/strict';
import { fetch } from '../../../packages/eventos/test/http-autenticado';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

let base = '';
let servidor: Server;
before(async () => {
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  // A configuração exige RABBITMQ_URL ao ser carregada; nenhuma conexão é aberta nestes testes.
  process.env.RABBITMQ_URL ??= 'amqp://teste:teste@localhost:5672';
  const { criarApp } = await import('../src/app');
  servidor = criarApp().listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => servidor.close(() => resolve())));

async function painel(query: string) {
  const resposta = await fetch(`${base}/lembretes/painel${query}`);
  return { status: resposta.status, corpo: await resposta.json() };
}

describe('US-09 CA2: filtros inválidos respondem 400 com motivo, antes de consultar o banco', () => {
  const casos: [string, RegExp][] = [
    ['?situacao=enviado,inexistente', /Situação inválida: inexistente/],
    ['?de=2026-13-01', /Data inicial inválida/],
    ['?ate=2026-02-30', /Data final inválida/],
    ['?de=24/11/2026', /Data inicial inválida/],
    ['?de=2026-11-30&ate=2026-11-01', /data inicial não pode ser posterior/],
    ['?pagina=0', /Página inválida/],
    ['?pagina=abc', /Página inválida/],
    ['?tamanhoPagina=101', /Tamanho de página inválido/],
    ['?tamanhoPagina=1.5', /Tamanho de página inválido/],
  ];
  for (const [query, motivo] of casos) {
    test(query, async () => {
      const { status, corpo } = await painel(query);
      assert.equal(status, 400);
      assert.match(corpo.erro, motivo);
    });
  }
});

describe('US-09 com banco', { skip: !process.env.TEST_DATABASE_URL }, () => {
  // Período exclusivo deste teste (2031), para não misturar com lembretes de outros testes.
  const ids: string[] = [];
  const criar = async (dia: string, horaLocal: string, status: string, extra: Record<string, unknown> = {}) => {
    const { prisma } = await import('../src/db');
    const idConsulta = crypto.randomUUID();
    ids.push(idConsulta);
    const inicio = new Date(`${dia}T${horaLocal}:00-03:00`);
    await prisma.lembrete.create({
      data: {
        idConsulta, pacienteNome: `Paciente Fictício ${status}`, pacienteCpf: '00000009001', telefone: '81900000901',
        profissional: 'Profissional Fictício', especialidade: 'Teste', inicioConsulta: inicio,
        enviarEm: new Date(inicio.getTime() - 86_400_000), status: status as never, ...extra,
      },
    });
    return idConsulta;
  };

  before(async () => {
    await criar('2031-03-10', '08:00', 'programado');
    await criar('2031-03-10', '23:30', 'falhou', { motivoFalha: 'WhatsApp respondeu HTTP 503', tentativas: 3 });
    await criar('2031-03-11', '00:10', 'simulado', { modoEnvio: 'simulado', canalEnvio: 'log', tentativas: 1 });
    await criar('2031-03-12', '09:00', 'bloqueado', { motivoFalha: 'sem autorização de contato por WhatsApp registrada' });
    await criar('2031-03-13', '09:00', 'cancelado');
  });
  after(async () => {
    const { prisma } = await import('../src/db');
    await prisma.lembrete.deleteMany({ where: { idConsulta: { in: ids } } });
    await prisma.$disconnect();
  });

  test('CA1: itens trazem consulta, previsão, situação, modo e motivo, sem CPF nem telefone', async () => {
    const { status, corpo } = await painel('?de=2031-03-10&ate=2031-03-13');
    assert.equal(status, 200);
    assert.equal(corpo.total, 5);
    const falhou = corpo.itens.find((l: { status: string }) => l.status === 'falhou');
    assert.equal(falhou.motivoFalha, 'WhatsApp respondeu HTTP 503');
    assert.equal(falhou.tentativas, 3);
    for (const campo of ['idConsulta', 'pacienteNome', 'profissional', 'especialidade', 'inicioConsulta', 'enviarEm', 'modoEnvio', 'canalEnvio']) {
      assert.ok(campo in falhou, campo);
    }
    const texto = JSON.stringify(corpo);
    assert.ok(!('pacienteCpf' in falhou) && !('telefone' in falhou));
    assert.ok(!texto.includes('00000009001') && !texto.includes('81900000901'));
  });

  test('CA2: período usa o dia civil de Recife nas duas pontas', async () => {
    // 23:30 de 10/03 em Recife é 02:30 de 11/03 em UTC: continua no dia 10.
    const dia10 = await painel('?de=2031-03-10&ate=2031-03-10');
    assert.deepEqual(dia10.corpo.itens.map((l: { status: string }) => l.status), ['programado', 'falhou']);
    const dia11 = await painel('?de=2031-03-11&ate=2031-03-11');
    assert.deepEqual(dia11.corpo.itens.map((l: { status: string }) => l.status), ['simulado']);
  });

  test('CA2: filtro por várias situações, ordem pelo início da consulta e contagem do período', async () => {
    const { corpo } = await painel('?de=2031-03-10&ate=2031-03-13&situacao=bloqueado,falhou');
    assert.equal(corpo.total, 2);
    assert.deepEqual(corpo.itens.map((l: { status: string }) => l.status), ['falhou', 'bloqueado']);
    // A contagem ignora o filtro de situação: mostra quantos há em cada uma, no período.
    assert.equal(corpo.contagem.programado, 1);
    assert.equal(corpo.contagem.simulado, 1);
    assert.equal(corpo.contagem.cancelado, 1);
    assert.equal(corpo.contagem.aceito_provedor, 0);
  });

  test('CA2: paginação estável sem repetir nem perder itens', async () => {
    const vistos: string[] = [];
    for (let pagina = 1; pagina <= 3; pagina++) {
      const { corpo } = await painel(`?de=2031-03-10&ate=2031-03-13&tamanhoPagina=2&pagina=${pagina}`);
      assert.equal(corpo.total, 5);
      assert.equal(corpo.pagina, pagina);
      assert.equal(corpo.tamanhoPagina, 2);
      vistos.push(...corpo.itens.map((l: { idConsulta: string }) => l.idConsulta));
    }
    assert.equal(vistos.length, 5);
    assert.equal(new Set(vistos).size, 5);
    const alem = await painel('?de=2031-03-10&ate=2031-03-13&tamanhoPagina=2&pagina=4');
    assert.deepEqual(alem.corpo.itens, []);
    assert.equal(alem.corpo.total, 5);
  });
});
