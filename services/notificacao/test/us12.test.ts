import assert from 'node:assert/strict';
import { verificarAcesso } from '@clinica/eventos';
import { fetch } from '../../../packages/eventos/test/http-autenticado';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { CanalWhatsApp } from '../src/canais/canal-whatsapp';

const whatsapp = {
  token: 'token-ficticio',
  phoneNumberId: '123',
  template: 'hello_world',
  idioma: 'en_US',
  versaoApi: 'v21.0',
  // US-15: envio real só para destinos de teste; o paciente fictício abaixo é o único destino.
  destinosPermitidos: new Set(['5581900000001']) as ReadonlySet<string>,
};
const paciente = { cpf: '12345678909', nome: 'Paciente Fictício', telefone: '81900000001' };

test('US-12 CA2: resposta sem identificador não constitui aceite', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ messages: [] }));
  await assert.rejects(new CanalWhatsApp(whatsapp).enviar({
    telefone: '5581900000001',
    pacienteNome: paciente.nome,
    profissional: 'Profissional Fictício',
    especialidade: 'Teste',
    inicioConsulta: new Date(),
  }), /sem identificador/);
  assert.equal(mock.mock.callCount(), 1);
});

test('US-12: resultados persistidos e expostos pelo GET /lembretes', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.RABBITMQ_URL = 'amqp://localhost';
  const { criarApp } = await import('../src/app');
  const { criarCanalEnvio } = await import('../src/canais');
  const { prisma } = await import('../src/db');
  await (await import('./apoio/autorizacao')).autorizarWhatsApp(prisma, '12345678909');
  const { iniciarRotinaEnvio } = await import('../src/envio/rotina-envio');
  const { programar, reprogramar } = await import('../src/lembretes/servico');
  const servidor = criarApp(verificarAcesso).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const porta = (servidor.address() as AddressInfo).port;
  const consultarHttp = globalThis.fetch;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
    await prisma.$disconnect();
  });

  for (const cenario of [
    { nome: 'log explícito', canalEnvio: 'log', token: whatsapp.token, falhar: false, status: 'simulado' },
    { nome: 'fallback por credencial ausente', canalEnvio: 'whatsapp', token: '', falhar: false, status: 'simulado' },
    { nome: 'aceite com identificador', canalEnvio: 'whatsapp', token: whatsapp.token, falhar: false, status: 'aceito_provedor' },
    { nome: 'falha real em todas as tentativas', canalEnvio: 'whatsapp', token: whatsapp.token, falhar: true, status: 'falhou' },
  ] as const) {
    await t.test(cenario.nome, async (subteste) => {
      const id = crypto.randomUUID();
      const payload = {
        id_consulta: id,
        paciente,
        profissional: 'Profissional Fictício',
        especialidade: 'Teste',
        inicio: new Date(Date.now() + 30_000).toISOString(),
      };
      const mock = subteste.mock.method(globalThis, 'fetch', async (url: string) => {
        assert.match(url, /^https:\/\/graph\.facebook\.com\//);
        return cenario.falhar
          ? Response.json({ error: { message: `Erro com dado fictício ${paciente.telefone}` } }, { status: 503 })
          : Response.json({ messages: [{ id: 'wamid.ficticio' }] });
      });
      const canal = criarCanalEnvio({ canalEnvio: cenario.canalEnvio, whatsapp: { ...whatsapp, token: cenario.token } });
      const consultar = async () => {
        const resposta = await consultarHttp(`http://127.0.0.1:${porta}/lembretes?consulta=${id}`);
        assert.equal(resposta.status, 200);
        const [lembrete] = await resposta.json();
        return lembrete;
      };
      let parar = () => {};
      try {
        await prisma.$transaction((tx) => programar(tx, payload, id));
        parar = iniciarRotinaEnvio(canal, 10, 2);
        const limite = Date.now() + 5000;
        let resultado = await consultar();
        // 'enviando' é a reserva da US-11 durante a chamada ao canal: ainda não é resultado.
        while (['programado', 'enviando'].includes(resultado.status) && Date.now() < limite) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          resultado = await consultar();
        }
        parar();
        assert.equal(resultado.status, cenario.status);
        assert.equal(resultado.tentativas, cenario.falhar ? 2 : 1);
        assert.equal(resultado.motivoFalha, cenario.falhar ? 'WhatsApp respondeu HTTP 503' : null);
        assert.equal(resultado.idExterno, cenario.status === 'aceito_provedor' ? 'wamid.ficticio' : null);
        assert.equal(resultado.canalEnvio, cenario.status === 'simulado' ? 'log' : 'whatsapp');
        assert.equal(resultado.modoEnvio, cenario.status === 'simulado' ? 'simulado' : 'real');
        assert.equal(Boolean(resultado.enviadoEm), !cenario.falhar);
        assert.equal(mock.mock.callCount(), cenario.status === 'simulado' ? 0 : resultado.tentativas);
        const acao = `lembrete.${cenario.status}`;
        const atividade = await prisma.atividade.findFirstOrThrow({ where: { idConsulta: id, idEvento: id, acao } });
        assert.ok(!atividade.descricao.includes(paciente.telefone));

        await prisma.$transaction((tx) => reprogramar(tx, {
          ...payload, inicio: new Date(Date.now() + 172_800_000).toISOString(),
        }, `${id}-remarcada`));
        const remarcado = await consultar();
        assert.equal(remarcado.status, 'programado');
        assert.equal(remarcado.idExterno, null);
        assert.equal(remarcado.canalEnvio, null);
        assert.equal(remarcado.modoEnvio, null);
        assert.equal(remarcado.tentativas, 0);
      } finally {
        parar();
        await prisma.atividade.deleteMany({ where: { idConsulta: id } });
        await prisma.lembrete.deleteMany({ where: { idConsulta: id } });
      }
    });
  }
});
