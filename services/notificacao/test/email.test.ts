import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CanalEmail, lerDestinosEmail } from '../src/canais/canal-email';
import { CanalLog } from '../src/canais/canal-log';
import { EnvioIncerto, FalhaEnvio, type MensagemLembrete } from '../src/canais/canal-envio';
import { descreverEnvio } from '../src/canais/configuracao-envio';

const mensagem: MensagemLembrete = {
  email: 'paciente@example.test', telefone: '5581900000000', pacienteNome: 'Paciente Teste',
  profissional: 'Profissional Teste', especialidade: 'Teste', inicioConsulta: new Date('2031-03-11T13:30:00Z'),
};
const cfg = { token: 'ficticio', remetente: 'clinica@example.test', destinosPermitidos: lerDestinosEmail(mensagem.email!) };

test('Resend recebe a mensagem personalizada e devolve o identificador de aceite', async () => {
  const canal = new CanalEmail(cfg, async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const corpo = JSON.parse(String(init?.body));
    assert.deepEqual(corpo.to, [mensagem.email]);
    assert.equal(corpo.from, cfg.remetente);
    assert.match(corpo.text, /Paciente Teste/);
    assert.match(corpo.text, /Profissional Teste/);
    assert.match(corpo.text, /10:30/);
    return Response.json({ id: 'email-teste' });
  });
  assert.deepEqual(await canal.enviar(mensagem), { status: 'aceito_provedor', modoEnvio: 'real', canalEnvio: 'email', idExterno: 'email-teste' });
});

test('endereço ausente ou fora da lista não chama o provedor', async () => {
  let chamadas = 0;
  const canal = new CanalEmail(cfg, async () => { chamadas++; return Response.json({ id: 'x' }); });
  for (const email of [null, 'invalido', 'outro@example.test']) {
    await assert.rejects(canal.enviar({ ...mensagem, email }), (erro: unknown) => erro instanceof FalhaEnvio && erro.definitiva);
  }
  assert.equal(chamadas, 0);
});

test('classifica falhas definitivas, limite de requisições e resposta incerta sem vazar dados', async () => {
  for (const status of [400, 403, 429, 503]) {
    const canal = new CanalEmail(cfg, async () => new Response('endereço privado', { status }));
    await assert.rejects(canal.enviar(mensagem), (erro: unknown) => {
      assert.ok(erro instanceof Error && !erro.message.includes('endereço privado'));
      return status === 503 ? erro instanceof EnvioIncerto : erro instanceof FalhaEnvio && erro.definitiva === (status !== 429);
    });
  }
  await assert.rejects(new CanalEmail(cfg, async () => { throw new Error('privado'); }).enviar(mensagem), EnvioIncerto);
  await assert.rejects(new CanalEmail(cfg, async () => Response.json({})).enviar(mensagem), EnvioIncerto);
});

test('simulação identifica e-mail, sem chamada ao provedor', async () => {
  const simulado = new CanalLog('email');
  assert.equal(simulado.canalContato, 'email');
  assert.equal(simulado.simulado, true);
  assert.deepEqual(await simulado.enviar(mensagem), { status: 'simulado', modoEnvio: 'simulado', canalEnvio: 'email', idExterno: null });
  await assert.rejects(simulado.enviar({ ...mensagem, email: null }), FalhaEnvio);
  const whatsapp = { token: '', phoneNumberId: '', destinosPermitidos: new Set<string>() };
  assert.equal(descreverEnvio({ canalEnvio: 'email_log', whatsapp, email: cfg }).modo, 'simulado');
  assert.equal(descreverEnvio({ canalEnvio: 'email', whatsapp }).modo, 'simulado');
  assert.equal(descreverEnvio({ canalEnvio: 'email', whatsapp, email: cfg }).canal, 'email');
});

test('rotina: usa contato mestre e exige consentimento de e-mail, gravando a trilha', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.RABBITMQ_URL = 'amqp://localhost';
  const { prisma } = await import('../src/db');
  const { programar } = await import('../src/lembretes/servico');
  const { iniciarRotinaEnvio } = await import('../src/envio/rotina-envio');
  const { tratarEvento } = await import('../src/consumidor/tratadores');
  const { criarEnvelope } = await import('@clinica/eventos');
  t.after(() => prisma.$disconnect());
  for (const [cpf, situacao] of [['00000031001', 'autorizado'], ['00000031002', 'revogado'], ['00000031003', 'ausente']]) {
    const id = crypto.randomUUID();
    let chamadas = 0;
    await prisma.autorizacaoContato.deleteMany({ where: { cpf } });
    await prisma.contatoPaciente.deleteMany({ where: { cpf } });
    await prisma.$transaction(async tx => {
      await tratarEvento(tx, criarEnvelope({
        tipo: 'paciente.atualizado', origem: 'cadastro', id_correlacao: id,
        payload: { id_paciente: id, cpf, nome: mensagem.pacienteNome, telefone: '81900000000', email: mensagem.email!, revisao: 1 },
      }));
      await programar(tx, { id_consulta: id, paciente: { cpf, nome: mensagem.pacienteNome, telefone: '81900000000' }, profissional: mensagem.profissional, especialidade: 'Teste', inicio: new Date(Date.now() + 3_600_000).toISOString() }, id);
      if (situacao !== 'ausente') await tx.autorizacaoContato.create({ data: { cpf, canal: 'email', idPaciente: id, situacao, versao: 1, registradoEm: new Date() } });
    });
    const parar = iniciarRotinaEnvio(new CanalEmail(cfg, async (_url, init) => {
      chamadas++;
      assert.deepEqual(JSON.parse(String(init?.body)).to, [mensagem.email]);
      return Response.json({ id: 'resend-ficticio' });
    }), 20, 1);
    try {
      const limite = Date.now() + 5000;
      let lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      while (['programado', 'enviando'].includes(lembrete.status) && Date.now() < limite) {
        await new Promise(resolve => setTimeout(resolve, 30));
        lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      }
      const autorizado = situacao === 'autorizado';
      assert.equal(lembrete.status, autorizado ? 'aceito_provedor' : 'bloqueado');
      assert.equal(chamadas, autorizado ? 1 : 0);
      const trilha = await prisma.tentativaEnvio.findMany({ where: { idConsulta: id } });
      assert.equal(trilha.length, autorizado ? 1 : 0);
      if (autorizado) {
        assert.equal(trilha[0].canal, 'email');
        assert.equal(trilha[0].idExterno, 'resend-ficticio');
      }
    } finally {
      parar();
      await prisma.atividade.deleteMany({ where: { idConsulta: id } });
      await prisma.lembrete.deleteMany({ where: { idConsulta: id } });
      await prisma.autorizacaoContato.deleteMany({ where: { cpf } });
      await prisma.contatoPaciente.deleteMany({ where: { cpf } });
    }
  }
});
