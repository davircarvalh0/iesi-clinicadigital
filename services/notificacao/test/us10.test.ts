import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dataHora } from '../../../apps/recepcao/src/formatacao';
import { lerConfiguracaoLembretes } from '../src/lembretes/configuracao';
import { calcularEnvio, MOTIVO_CONSULTA_INICIADA } from '../src/lembretes/horario';

test('US-10 CA1: 24 horas antes atravessam dia e mês mantendo o horário exibido em Recife', () => {
  const config = lerConfiguracaoLembretes({});
  const inicio = new Date('2026-12-01T23:30:00-03:00');
  const { enviarEm, expirado } = calcularEnvio(inicio, new Date('2026-11-29T00:00:00Z'), config.antecedenciaMinutos);
  assert.equal(config.modoAntecedencia, 'normal');
  assert.equal(inicio.getTime() - enviarEm.getTime(), 86_400_000);
  assert.equal(enviarEm.toISOString(), '2026-12-01T02:30:00.000Z');
  assert.equal(dataHora(enviarEm.toISOString()), '30/11 às 23:30');
  assert.equal(expirado, false);
});

test('US-10 CA2 e CA3: limites de 24 horas, consulta futura próxima e consulta iniciada', () => {
  const agora = new Date('2026-11-23T13:00:00Z');
  for (const ms of [86_400_000, 86_399_999, 1]) {
    const resultado = calcularEnvio(new Date(agora.getTime() + ms), agora, 1440);
    assert.deepEqual(resultado, { enviarEm: agora, expirado: false });
  }
  for (const ms of [0, -1]) {
    assert.equal(calcularEnvio(new Date(agora.getTime() + ms), agora, 1440).expirado, true);
  }
});

test('US-10 CA3: demonstração e valores de configuração inválidos', () => {
  assert.deepEqual(lerConfiguracaoLembretes({ LEMBRETE_ANTECEDENCIA_MINUTOS: '1' }), {
    modoAntecedencia: 'demonstracao', antecedenciaMinutos: 1, rotinaEnvioIntervaloMs: 5000, envioMaxTentativas: 3,
    envioReservaExpiraMs: 60000, // US-15
  });
  for (const valor of ['', '0', '-1', '1.5', 'NaN', '1441', '1e2']) {
    assert.throws(() => lerConfiguracaoLembretes({ LEMBRETE_ANTECEDENCIA_MINUTOS: valor }), /LEMBRETE_ANTECEDENCIA_MINUTOS inválido/);
  }
  assert.throws(() => lerConfiguracaoLembretes({ ROTINA_ENVIO_INTERVALO_MS: '2147483648' }), /ROTINA_ENVIO_INTERVALO_MS inválido/);
  assert.throws(() => lerConfiguracaoLembretes({ ENVIO_MAX_TENTATIVAS: '0' }), /ENVIO_MAX_TENTATIVAS inválido/);
  // US-15: a reserva precisa durar mais que o tempo limite da chamada ao WhatsApp (10 s).
  assert.throws(() => lerConfiguracaoLembretes({ ENVIO_RESERVA_EXPIRA_MS: '10000' }), /ENVIO_RESERVA_EXPIRA_MS inválido/);
  assert.equal(lerConfiguracaoLembretes({ ENVIO_RESERVA_EXPIRA_MS: '10001' }).envioReservaExpiraMs, 10001);
});

test('US-10: remarcação recalcula pela nova data e a rotina descarta pendências antigas', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.RABBITMQ_URL = 'amqp://localhost';
  process.env.LEMBRETE_ANTECEDENCIA_MINUTOS = '1440';
  const { prisma } = await import('../src/db');
  await (await import('./apoio/autorizacao')).autorizarWhatsApp(prisma, '12345678909');
  const { programar, reprogramar } = await import('../src/lembretes/servico');
  const { iniciarRotinaEnvio } = await import('../src/envio/rotina-envio');
  const id = crypto.randomUUID();
  const payload = {
    id_consulta: id,
    paciente: { cpf: '12345678909', nome: 'Paciente Fictício', telefone: '81900000001' },
    profissional: 'Profissional Fictício',
    especialidade: 'Teste',
    inicio: new Date(Date.now() + 60_000).toISOString(),
  };
  const consultar = () => prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
  let parar = () => {};
  try {
    await prisma.$transaction((tx) => programar(tx, payload, `${id}-agendada`));
    const imediato = await consultar();
    assert.ok(imediato.enviarEm < imediato.inicioConsulta);
    assert.ok(imediato.enviarEm.getTime() > Date.now() - 10_000);

    const novoInicio = new Date(Date.now() + 172_800_000);
    await prisma.$transaction((tx) => reprogramar(tx, { ...payload, inicio: novoInicio.toISOString() }, `${id}-remarcada`));
    const remarcado = await consultar();
    assert.equal(remarcado.inicioConsulta.getTime(), novoInicio.getTime());
    assert.equal(remarcado.enviarEm.getTime(), novoInicio.getTime() - 86_400_000);
    assert.equal(remarcado.idEventoConsulta, `${id}-remarcada`);

    await prisma.lembrete.update({
      where: { idConsulta: id }, data: { inicioConsulta: new Date(Date.now() - 1000), enviarEm: new Date(0) },
    });
    let disparos = 0;
    parar = iniciarRotinaEnvio({
      nome: 'log',
      canalContato: 'whatsapp' as const,
      async enviar() {
        disparos++;
        return { status: 'simulado', modoEnvio: 'simulado', canalEnvio: 'log', idExterno: null };
      },
    }, 10, 1);
    const limite = Date.now() + 5000;
    let lembrete = await consultar();
    while (lembrete.status === 'programado' && Date.now() < limite) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      lembrete = await consultar();
    }
    assert.equal(lembrete.status, 'falhou');
    assert.equal(lembrete.motivoFalha, MOTIVO_CONSULTA_INICIADA);
    assert.equal(disparos, 0);
    assert.equal(await prisma.atividade.count({ where: { idEvento: `${id}-remarcada`, acao: 'lembrete.expirado' } }), 1);
  } finally {
    parar();
    await prisma.atividade.deleteMany({ where: { idConsulta: id } });
    await prisma.lembrete.deleteMany({ where: { idConsulta: id } });
    await prisma.$disconnect();
  }
});
