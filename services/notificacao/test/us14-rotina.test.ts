// US-14 na rotina de envio: a cópia local da autorização é consultada antes de cada tentativa.
// Regressão: a verificação tinha sido perdida numa mesclagem e o lembrete saía sem autorização.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// CPFs fictícios, exclusivos deste arquivo (prefixo 000.000.14x).
const CPF_SEM_REGISTRO = '00000014001';
const CPF_REVOGADO = '00000014002';
const CPF_AUTORIZADO = '00000014003';

test('US-14: a rotina só chama o canal com autorização de WhatsApp registrada', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.RABBITMQ_URL = 'amqp://localhost';
  const { prisma } = await import('../src/db');
  const { programar } = await import('../src/lembretes/servico');
  const { iniciarRotinaEnvio } = await import('../src/envio/rotina-envio');
  t.after(() => prisma.$disconnect());

  const definirCopia = (cpf: string, situacao: 'autorizado' | 'revogado') => prisma.autorizacaoContato.upsert({
    where: { cpf_canal: { cpf, canal: 'whatsapp' } },
    create: { cpf, canal: 'whatsapp', idPaciente: `teste-${cpf}`, situacao, versao: 1, registradoEm: new Date() },
    update: { situacao },
  });
  await prisma.autorizacaoContato.deleteMany({ where: { cpf: CPF_SEM_REGISTRO } });
  await definirCopia(CPF_REVOGADO, 'revogado');
  await definirCopia(CPF_AUTORIZADO, 'autorizado');

  async function enviarPara(cpf: string) {
    const id = crypto.randomUUID();
    const chamadas: string[] = [];
    await prisma.$transaction((tx) => programar(tx, {
      id_consulta: id,
      paciente: { cpf, nome: 'Paciente Fictício US14', telefone: '81900000014' },
      profissional: 'Profissional Fictício',
      especialidade: 'Teste',
      // Dentro das 24 h: o lembrete já está vencido e entra no próximo ciclo.
      inicio: new Date(Date.now() + 3_600_000).toISOString(),
    }, `${id}-agendada`));
    const parar = iniciarRotinaEnvio({
      nome: 'log',
      canalContato: 'whatsapp',
      async enviar() {
        chamadas.push(id);
        return { status: 'simulado', modoEnvio: 'simulado', canalEnvio: 'log', idExterno: null };
      },
    }, 10, 1);
    try {
      const limite = Date.now() + 5000;
      let lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      while (['programado', 'enviando'].includes(lembrete.status) && Date.now() < limite) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        lembrete = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      }
      const atividades = await prisma.atividade.findMany({ where: { idConsulta: id } });
      return { lembrete, chamadas, atividades };
    } finally {
      parar();
      await prisma.atividade.deleteMany({ where: { idConsulta: id } });
      await prisma.lembrete.deleteMany({ where: { idConsulta: id } });
    }
  }

  await t.test('sem registro: bloqueado, com motivo e atividade, sem chamar o canal', async () => {
    const { lembrete, chamadas, atividades } = await enviarPara(CPF_SEM_REGISTRO);
    assert.equal(lembrete.status, 'bloqueado');
    assert.match(lembrete.motivoFalha ?? '', /sem autorização de contato por WhatsApp/);
    assert.equal(chamadas.length, 0);
    assert.equal(lembrete.tentativas, 0);
    assert.ok(atividades.some((a) => a.acao === 'lembrete.bloqueado'));
    assert.ok(atividades.every((a) => !a.descricao.includes(CPF_SEM_REGISTRO)));
  });

  await t.test('revogado: bloqueado sem chamar o canal', async () => {
    const { lembrete, chamadas } = await enviarPara(CPF_REVOGADO);
    assert.equal(lembrete.status, 'bloqueado');
    assert.match(lembrete.motivoFalha ?? '', /revogada/);
    assert.equal(chamadas.length, 0);
  });

  await t.test('autorizado: o canal é chamado uma vez e o resultado é registrado', async () => {
    const { lembrete, chamadas } = await enviarPara(CPF_AUTORIZADO);
    assert.equal(lembrete.status, 'simulado');
    assert.equal(chamadas.length, 1);
    assert.equal(lembrete.tentativas, 1);
  });
});
