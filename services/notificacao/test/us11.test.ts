import assert from 'node:assert/strict';
import { test } from 'node:test';

function payloadFicticio(idConsulta: string, alteracoes: Record<string, unknown> = {}) {
  return {
    id_consulta: idConsulta,
    paciente: { cpf: '12345678909', nome: 'Paciente Fictício US11', telefone: '81900000011' },
    profissional: 'Profissional Fictício',
    especialidade: 'Teste',
    inicio: new Date(Date.now() + 3_600_000).toISOString(),
    ...alteracoes,
  };
}

test('US-11: cancelamento, sequência fora de ordem e corrida com o envio', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.RABBITMQ_URL = 'amqp://localhost';
  const { prisma } = await import('../src/db');
  await (await import('./apoio/autorizacao')).autorizarWhatsApp(prisma, '12345678909');
  const { programar, reprogramar, cancelar } = await import('../src/lembretes/servico');
  const { iniciarRotinaEnvio } = await import('../src/envio/rotina-envio');

  const atividades = (idConsulta: string) =>
    prisma.atividade.findMany({ where: { idConsulta }, orderBy: { ocorridoEm: 'asc' } });
  const limpar = (idConsulta: string) => Promise.all([
    prisma.atividade.deleteMany({ where: { idConsulta } }),
    prisma.lembrete.deleteMany({ where: { idConsulta } }),
  ]);

  await t.test('CA1: cancelamento antes do início do envio externo — o canal nunca é chamado', async () => {
    const id = crypto.randomUUID();
    try {
      const payload = payloadFicticio(id);
      await prisma.$transaction((tx) => programar(tx, payload, `${id}-agendada`));
      await prisma.$transaction((tx) => cancelar(tx, payload, `${id}-cancelada`));

      const lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      assert.equal(lembrete.status, 'cancelado');

      let disparos = 0;
      const parar = iniciarRotinaEnvio({
        nome: 'log',
        canalContato: 'whatsapp' as const,
        async enviar() { disparos++; return { status: 'simulado', modoEnvio: 'simulado', canalEnvio: 'log', idExterno: null }; },
      }, 10, 1);
      await new Promise((resolve) => setTimeout(resolve, 100));
      parar();
      assert.equal(disparos, 0, 'lembrete cancelado não entra na rotina de envio');
    } finally {
      await limpar(id);
    }
  });

  await t.test('CA2: evento antigo (sequência menor) após cancelamento é ignorado, sem reativar', async () => {
    const id = crypto.randomUUID();
    try {
      const agendada = payloadFicticio(id, { sequencia: 1 });
      const cancelada = payloadFicticio(id, { sequencia: 2 });
      await prisma.$transaction((tx) => programar(tx, agendada, `${id}-agendada`));
      await prisma.$transaction((tx) => cancelar(tx, cancelada, `${id}-cancelada`));

      // Reentrega atrasada do mesmo agendamento (sequência 1, já superada pela 2).
      await prisma.$transaction((tx) => programar(tx, agendada, `${id}-agendada-reentrega`));

      const lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      assert.equal(lembrete.status, 'cancelado', 'cancelado é terminal; evento obsoleto não reativa');
      assert.deepEqual(
        (await atividades(id)).map((a) => a.acao).slice(-1),
        ['lembrete.evento_obsoleto'],
      );
    } finally {
      await limpar(id);
    }
  });

  await t.test('CA2: evento antigo após nova remarcação é ignorado', async () => {
    const id = crypto.randomUUID();
    try {
      const v1 = payloadFicticio(id, { sequencia: 1 });
      const v2 = payloadFicticio(id, { sequencia: 2, inicio: new Date(Date.now() + 7_200_000).toISOString() });
      await prisma.$transaction((tx) => programar(tx, v1, `${id}-agendada`));
      await prisma.$transaction((tx) => reprogramar(tx, v2, `${id}-remarcada`));

      // v1 reentregue fora de ordem, depois da remarcação para v2.
      await prisma.$transaction((tx) => reprogramar(tx, v1, `${id}-remarcada-antiga`));

      const lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      assert.equal(lembrete.inicioConsulta.toISOString(), v2.inicio, 'a reprogramação mais nova prevalece');
      assert.deepEqual(
        (await atividades(id)).map((a) => a.acao).slice(-1),
        ['lembrete.evento_obsoleto'],
      );
    } finally {
      await limpar(id);
    }
  });

  await t.test('CA2: cancelamento recebido antes do agendamento marca o estado terminal direto', async () => {
    const id = crypto.randomUUID();
    try {
      const cancelada = payloadFicticio(id, { sequencia: 2 });
      const agendadaAtrasada = payloadFicticio(id, { sequencia: 1 });

      await prisma.$transaction((tx) => cancelar(tx, cancelada, `${id}-cancelada`));
      let lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      assert.equal(lembrete.status, 'cancelado');

      await prisma.$transaction((tx) => programar(tx, agendadaAtrasada, `${id}-agendada-atrasada`));
      lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      assert.equal(lembrete.status, 'cancelado', 'o agendamento atrasado é ignorado');
    } finally {
      await limpar(id);
    }
  });

  await t.test('CA3: cancelamento durante o envio não desfaz o resultado e registra a corrida', async () => {
    const id = crypto.randomUUID();
    try {
      const payload = payloadFicticio(id, {
        inicio: new Date(Date.now() + 3_600_000).toISOString(),
      });
      await prisma.$transaction((tx) => programar(tx, payload, `${id}-agendada`));
      await prisma.lembrete.update({
        where: { idConsulta: id }, data: { inicioConsulta: new Date(Date.now() + 10_000), enviarEm: new Date(0) },
      });

      let liberarEnvio!: () => void;
      const canalDemorado = {
        nome: 'log' as const,
        canalContato: 'whatsapp' as const,
        async enviar() {
          await new Promise<void>((resolve) => { liberarEnvio = resolve; });
          return { status: 'simulado' as const, modoEnvio: 'simulado' as const, canalEnvio: 'log' as const, idExterno: null };
        },
      };
      const parar = iniciarRotinaEnvio(canalDemorado, 10, 1);

      // Espera a rotina reservar o envio (status 'enviando') antes de cancelar.
      const limiteReserva = Date.now() + 5000;
      let reservado = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      while (reservado.status !== 'enviando' && Date.now() < limiteReserva) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        reservado = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      }
      assert.equal(reservado.status, 'enviando', 'a rotina reservou o envio antes de chamar o canal');

      await prisma.$transaction((tx) => cancelar(tx, payload, `${id}-cancelada-concorrente`));
      const duranteCorrida = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      assert.equal(duranteCorrida.status, 'enviando', 'a corrida não reverte o envio em curso');

      liberarEnvio();
      const limite = Date.now() + 5000;
      let final = duranteCorrida;
      while (final.status === 'enviando' && Date.now() < limite) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        final = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      }
      parar();

      assert.equal(final.status, 'simulado', 'o envio já iniciado conclui normalmente, sem ser ocultado como cancelamento');
      const acoes = (await atividades(id)).map((a) => a.acao);
      assert.ok(acoes.includes('lembrete.corrida_envio'), 'a corrida foi registrada explicitamente');
      assert.ok(acoes.includes('lembrete.simulado'), 'o resultado real do envio também foi registrado');
    } finally {
      await limpar(id);
    }
  });

  await t.test('evento duplicado (mesma sequência) é ignorado', async () => {
    const id = crypto.randomUUID();
    try {
      const payload = payloadFicticio(id, { sequencia: 1 });
      await prisma.$transaction((tx) => programar(tx, payload, `${id}-agendada`));
      const primeira = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });

      // Mesmo id_evento seria barrado pela idempotência do consumidor (eventos_processados);
      // aqui simulamos a reentrega com outro id_evento mas a mesma sequência já aplicada.
      await prisma.$transaction((tx) => programar(tx, payload, `${id}-agendada-duplicada`));
      const depois = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });

      assert.equal(depois.atualizadoEm.getTime(), primeira.atualizadoEm.getTime(), 'evento com sequência repetida não altera o lembrete');
      assert.deepEqual(
        (await atividades(id)).map((a) => a.acao).slice(-1),
        ['lembrete.evento_obsoleto'],
      );
    } finally {
      await limpar(id);
    }
  });
});
