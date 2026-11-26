// US-13: trilha rastreável das tentativas de envio (GET /lembretes/:idConsulta/trilha).
import assert from 'node:assert/strict';
import { fetch } from '../../../packages/eventos/test/http-autenticado';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

const CPF = '00000013001';
const TELEFONE = '81900000131';
const NOME = 'Paciente Fictício Treze';

let base = '';
let servidor: Server;
before(async () => {
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.RABBITMQ_URL ??= 'amqp://teste:teste@localhost:5672';
  const { criarApp } = await import('../src/app');
  servidor = criarApp().listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => servidor.close(() => resolve())));

const trilha = async (idConsulta: string) => {
  const resposta = await fetch(`${base}/lembretes/${idConsulta}/trilha`);
  return { status: resposta.status, corpo: await resposta.json() };
};

test('US-13: identificador de consulta inválido responde 400 sem consultar o banco', async () => {
  const { status, corpo } = await trilha('nao-e-um-uuid');
  assert.equal(status, 400);
  assert.match(corpo.erro, /Identificador de consulta inválido/);
});

describe('US-13 com banco', { skip: !process.env.TEST_DATABASE_URL }, () => {
  type Canal = import('../src/canais').CanalEnvio;
  let prisma: typeof import('../src/db').prisma;
  let servico: typeof import('../src/lembretes/servico');
  let iniciarRotinaEnvio: typeof import('../src/envio/rotina-envio').iniciarRotinaEnvio;
  const ids: string[] = [];

  before(async () => {
    ({ prisma } = await import('../src/db'));
    servico = await import('../src/lembretes/servico');
    ({ iniciarRotinaEnvio } = await import('../src/envio/rotina-envio'));
    await (await import('./apoio/autorizacao')).autorizarWhatsApp(prisma, CPF);
  });
  after(async () => {
    await prisma.atividade.deleteMany({ where: { idConsulta: { in: ids } } });
    await prisma.lembrete.deleteMany({ where: { idConsulta: { in: ids } } }); // tentativas saem em cascata
    await prisma.$disconnect();
  });

  function payload(id: string, horas = 1) {
    return {
      id_consulta: id, paciente: { cpf: CPF, nome: NOME, telefone: TELEFONE },
      profissional: 'Profissional Fictício', especialidade: 'Teste',
      inicio: new Date(Date.now() + horas * 3_600_000).toISOString(),
    };
  }

  async function programar(horas = 1) {
    const id = crypto.randomUUID();
    ids.push(id);
    await prisma.$transaction((tx) => servico.programar(tx, payload(id, horas), `${id}-agendada`));
    return id;
  }

  async function esperarStatus(id: string, aceitos: string[]) {
    const limite = Date.now() + 8000;
    let lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
    while (!aceitos.includes(lembrete.status) && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
    }
    return lembrete;
  }

  const simulado = { status: 'simulado', modoEnvio: 'simulado', canalEnvio: 'log', idExterno: null } as const;

  test('CA1 e CA2: envio simulado deixa uma tentativa concluída e a trilha em ordem, sem dados pessoais', async () => {
    const id = await programar();
    const parar = iniciarRotinaEnvio({ nome: 'log', canalContato: 'whatsapp', enviar: async () => simulado }, 10, 3);
    try {
      assert.equal((await esperarStatus(id, ['simulado'])).status, 'simulado');
    } finally { parar(); }

    const { status, corpo } = await trilha(id);
    assert.equal(status, 200);
    assert.equal(corpo.lembrete.status, 'simulado');
    assert.equal(corpo.tentativas.length, 1);
    const [t] = corpo.tentativas;
    assert.equal(t.numero, 1);
    assert.equal(t.canal, 'log');
    assert.equal(t.modo, 'simulado');
    assert.equal(t.resultado, 'simulado');
    assert.equal(t.idEventoConsulta, `${id}-agendada`);
    assert.ok(t.concluidaEm && Date.parse(t.concluidaEm) >= Date.parse(t.iniciadaEm));
    assert.deepEqual(corpo.atividades.map((a: { acao: string }) => a.acao), ['lembrete.programado', 'lembrete.simulado']);
    const texto = JSON.stringify(corpo);
    for (const pessoal of [CPF, TELEFONE, NOME]) assert.ok(!texto.includes(pessoal), 'trilha sem dados pessoais');
  });

  test('CA1: falha seguida de aceite registra as duas chamadas com motivo e identificador externo', async () => {
    const id = await programar();
    let chamadas = 0;
    const canal: Canal = {
      nome: 'whatsapp', canalContato: 'whatsapp',
      async enviar() {
        chamadas++;
        if (chamadas === 1) throw new (await import('../src/canais/canal-envio')).FalhaEnvio('WhatsApp respondeu HTTP 503');
        return { status: 'aceito_provedor', modoEnvio: 'real', canalEnvio: 'whatsapp', idExterno: 'wamid.ficticio.13' };
      },
    };
    const parar = iniciarRotinaEnvio(canal, 10, 3);
    try {
      assert.equal((await esperarStatus(id, ['aceito_provedor', 'falhou'])).status, 'aceito_provedor');
    } finally { parar(); }

    const { corpo } = await trilha(id);
    assert.deepEqual(
      corpo.tentativas.map((t: { numero: number; resultado: string; motivo: string | null; idExterno: string | null; modo: string }) =>
        [t.numero, t.resultado, t.motivo, t.idExterno, t.modo]),
      [[1, 'falhou', 'WhatsApp respondeu HTTP 503', null, 'real'], [2, 'aceito_provedor', null, 'wamid.ficticio.13', 'real']],
    );
    assert.ok(corpo.atividades.some((a: { acao: string }) => a.acao === 'envio.nova_tentativa'));
  });

  test('CA3: remarcação zera o resultado no lembrete, mas a trilha anterior permanece', async () => {
    const id = await programar();
    const parar = iniciarRotinaEnvio({ nome: 'log', canalContato: 'whatsapp', enviar: async () => simulado }, 10, 3);
    try { await esperarStatus(id, ['simulado']); } finally { parar(); }

    await prisma.$transaction((tx) => servico.reprogramar(tx, payload(id, 72), `${id}-remarcada`));
    const { corpo } = await trilha(id);
    assert.equal(corpo.lembrete.status, 'programado');
    assert.equal(corpo.lembrete.tentativas, 0);
    assert.equal(corpo.lembrete.idEventoConsulta, `${id}-remarcada`);
    assert.equal(corpo.tentativas.length, 1, 'a tentativa anterior à remarcação continua na trilha');
    assert.equal(corpo.tentativas[0].idEventoConsulta, `${id}-agendada`);
    assert.deepEqual(corpo.atividades.map((a: { acao: string }) => a.acao), ['lembrete.programado', 'lembrete.simulado', 'lembrete.reprogramado']);
  });

  test('CA3: chamada em curso aparece como tentativa em andamento, sem desfecho inventado', async () => {
    const id = await programar();
    let liberar: () => void = () => {};
    const segurar = new Promise<void>((resolve) => { liberar = resolve; });
    const parar = iniciarRotinaEnvio({
      nome: 'log', canalContato: 'whatsapp',
      async enviar() { await segurar; return simulado; },
    }, 10, 3);
    try {
      await esperarStatus(id, ['enviando']);
      const durante = await trilha(id);
      assert.equal(durante.corpo.lembrete.status, 'enviando');
      assert.equal(durante.corpo.tentativas.length, 1);
      assert.equal(durante.corpo.tentativas[0].resultado, 'em_andamento');
      assert.equal(durante.corpo.tentativas[0].concluidaEm, null);
      liberar();
      await esperarStatus(id, ['simulado']);
    } finally { liberar(); parar(); }
    const depois = await trilha(id);
    assert.equal(depois.corpo.tentativas[0].resultado, 'simulado');
    assert.ok(depois.corpo.tentativas[0].concluidaEm);
  });

  test('consulta sem lembrete responde 404 com motivo', async () => {
    const { status, corpo } = await trilha(crypto.randomUUID());
    assert.equal(status, 404);
    assert.match(corpo.erro, /Nenhum lembrete/);
  });
});
