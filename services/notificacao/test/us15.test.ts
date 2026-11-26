// US-15: envio real controlado, resultado incerto e decisão humana registrada.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { EnvioIncerto, FalhaEnvio } from '../src/canais/canal-envio';
import { CanalWhatsApp, classificarErroDeRede } from '../src/canais/canal-whatsapp';
import { descreverEnvio, destinoPermitido, lerDestinosPermitidos } from '../src/canais/configuracao-envio';

const CPF = '00000015001';
const TELEFONE_TESTE = '81900000151';

const mensagem = (telefone: string) => ({
  telefone, pacienteNome: 'Paciente Fictício Quinze', profissional: 'Profissional Fictício', especialidade: 'Teste', inicioConsulta: new Date(),
});
const configWhatsApp = (destinos: ReturnType<typeof lerDestinosPermitidos>) => ({
  token: 'token-ficticio', phoneNumberId: '123', template: 'hello_world', idioma: 'en_US', versaoApi: 'v21.0', destinosPermitidos: destinos,
});

describe('US-15 CA1: modo de envio explícito e destinos de teste', () => {
  test('lista de destinos: normaliza, aceita * e recusa valores inválidos', () => {
    const destinos = lerDestinosPermitidos('(81) 90000-0151; 5581900000152');
    assert.ok(destinos !== 'todos');
    assert.deepEqual([...destinos].sort(), ['5581900000151', '5581900000152']);
    assert.equal(destinoPermitido(destinos, '5581900000151'), true);
    assert.equal(destinoPermitido(destinos, '5581900000999'), false);
    assert.equal(lerDestinosPermitidos('*'), 'todos');
    assert.equal(destinoPermitido('todos', '5511999999999'), true);
    assert.equal((lerDestinosPermitidos(undefined) as ReadonlySet<string>).size, 0);
    assert.throws(() => lerDestinosPermitidos('123'), /WHATSAPP_DESTINOS_PERMITIDOS inválido/);
  });

  test('descrição do modo: simulado por configuração ou falta de credencial; real com quantidade de destinos', () => {
    const vazio = lerDestinosPermitidos('');
    assert.deepEqual(descreverEnvio({ canalEnvio: 'log', whatsapp: { token: 'x', phoneNumberId: '1', destinosPermitidos: vazio } }),
      { modo: 'simulado', canal: 'log', motivo: 'CANAL_ENVIO=log: nenhuma mensagem sai da clínica.', destinosPermitidos: null });
    assert.equal(descreverEnvio({ canalEnvio: 'whatsapp', whatsapp: { token: ' ', phoneNumberId: '1', destinosPermitidos: vazio } }).modo, 'simulado');
    const real = descreverEnvio({ canalEnvio: 'whatsapp', whatsapp: { token: 'x', phoneNumberId: '1', destinosPermitidos: lerDestinosPermitidos(TELEFONE_TESTE) } });
    assert.equal(real.modo, 'real');
    assert.equal(real.destinosPermitidos, 1);
    assert.match(real.motivo, /somente para 1 destino\(s\) de teste/);
    assert.ok(!JSON.stringify(real).includes(TELEFONE_TESTE), 'a descrição nunca expõe os números');
    assert.match(descreverEnvio({ canalEnvio: 'whatsapp', whatsapp: { token: 'x', phoneNumberId: '1', destinosPermitidos: vazio } }).motivo, /nenhuma mensagem será enviada/);
  });

  test('destino fora da lista: falha definitiva sem chamar o WhatsApp', async (t) => {
    const chamada = t.mock.method(globalThis, 'fetch', async () => Response.json({ messages: [{ id: 'wamid.x' }] }));
    const canal = new CanalWhatsApp(configWhatsApp(lerDestinosPermitidos(TELEFONE_TESTE)));
    await assert.rejects(canal.enviar(mensagem('5581900000999')), (erro: unknown) =>
      erro instanceof FalhaEnvio && erro.definitiva && /fora da lista de teste/.test(erro.message));
    assert.equal(chamada.mock.callCount(), 0);
    assert.equal((await canal.enviar(mensagem('5581900000151'))).idExterno, 'wamid.x');
    assert.equal(chamada.mock.callCount(), 1);
  });
});

describe('US-15 CA2: classificação do que pode ter saído', () => {
  const erroDeRede = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: { code } });
  test('tempo esgotado e conexão cortada são incertos', () => {
    const tempo = Object.assign(new Error('signal timed out'), { name: 'TimeoutError' });
    assert.ok(classificarErroDeRede(tempo) instanceof EnvioIncerto);
    assert.ok(classificarErroDeRede(erroDeRede('ECONNRESET')) instanceof EnvioIncerto);
    assert.ok(classificarErroDeRede(erroDeRede('UND_ERR_SOCKET')) instanceof EnvioIncerto);
    assert.ok(classificarErroDeRede(new Error('desconhecido')) instanceof EnvioIncerto);
  });
  test('conexão recusada, DNS e certificado não deixaram o pedido sair: falha comum, pode repetir', () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED']) {
      const resultado = classificarErroDeRede(erroDeRede(code));
      assert.ok(resultado instanceof FalhaEnvio && !resultado.definitiva, code);
    }
  });
  test('o adaptador entrega a classificação à rotina', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => { throw Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }); });
    const canal = new CanalWhatsApp(configWhatsApp('todos'));
    await assert.rejects(canal.enviar(mensagem('5581900000151')), EnvioIncerto);
  });
});

describe('US-15 com banco', { skip: !process.env.TEST_DATABASE_URL }, () => {
  type Canal = import('../src/canais').CanalEnvio;
  let prisma: typeof import('../src/db').prisma;
  let servico: typeof import('../src/lembretes/servico');
  let rotina: typeof import('../src/envio/rotina-envio');
  let base = '';
  let servidor: Server;
  const ids: string[] = [];

  before(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.RABBITMQ_URL ??= 'amqp://teste:teste@localhost:5672';
    ({ prisma } = await import('../src/db'));
    servico = await import('../src/lembretes/servico');
    rotina = await import('../src/envio/rotina-envio');
    await (await import('./apoio/autorizacao')).autorizarWhatsApp(prisma, CPF);
    const { criarApp } = await import('../src/app');
    servidor = criarApp().listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });
  after(async () => {
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
    await prisma.atividade.deleteMany({ where: { idConsulta: { in: ids } } });
    await prisma.lembrete.deleteMany({ where: { idConsulta: { in: ids } } });
    await prisma.$disconnect();
  });

  const payload = (id: string, horas = 1) => ({
    id_consulta: id, paciente: { cpf: CPF, nome: 'Paciente Fictício Quinze', telefone: TELEFONE_TESTE },
    profissional: 'Profissional Fictício', especialidade: 'Teste', inicio: new Date(Date.now() + horas * 3_600_000).toISOString(),
  });
  async function programar(horas = 1) {
    const id = crypto.randomUUID();
    ids.push(id);
    await prisma.$transaction((tx) => servico.programar(tx, payload(id, horas), `${id}-agendada`));
    return id;
  }
  async function esperar(id: string, aceitos: string[]) {
    const limite = Date.now() + 8000;
    let l = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
    while (!aceitos.includes(l.status) && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 20));
      l = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
    }
    return l;
  }
  const canalQue = (enviar: Canal['enviar']): Canal => ({ nome: 'whatsapp', canalContato: 'whatsapp', enviar });
  const resolver = async (id: string, corpo: unknown) => {
    const r = await fetch(`${base}/lembretes/${id}/resolucao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json() };
  };

  test('CA2: resultado incerto não é repetido sozinho e fica visível com motivo', async () => {
    const id = await programar();
    let chamadas = 0;
    const parar = rotina.iniciarRotinaEnvio(canalQue(async () => { chamadas++; throw new EnvioIncerto('Sem resposta do WhatsApp no tempo limite: a mensagem pode ter sido enviada'); }), 10, 3);
    try {
      const l = await esperar(id, ['incerto']);
      await new Promise((r) => setTimeout(r, 150)); // ciclos extras não chamam de novo
      assert.equal(l.status, 'incerto');
      assert.match(l.motivoFalha ?? '', /pode ter sido enviada/);
      assert.equal(l.tentativas, 1);
      assert.equal(l.modoEnvio, 'real');
    } finally { parar(); }
    assert.equal(chamadas, 1, 'nenhuma nova chamada automática');
    const [t] = await prisma.tentativaEnvio.findMany({ where: { idConsulta: id } });
    assert.equal(t.resultado, 'indeterminado');
    assert.ok(t.concluidaEm);
    const painel = await (await fetch(`${base}/lembretes/painel?situacao=incerto&tamanhoPagina=100`)).json();
    assert.ok(painel.itens.some((i: { idConsulta: string }) => i.idConsulta === id));
  });

  test('CA1: destino fora da lista falha uma vez, sem novas tentativas', async () => {
    const id = await programar();
    let chamadas = 0;
    const parar = rotina.iniciarRotinaEnvio(canalQue(async () => { chamadas++; throw new FalhaEnvio('Destino fora da lista de teste (WHATSAPP_DESTINOS_PERMITIDOS): nenhuma mensagem enviada', true); }), 10, 3);
    try {
      const l = await esperar(id, ['falhou']);
      assert.equal(l.status, 'falhou');
      assert.equal(l.tentativas, 1);
      assert.match(l.motivoFalha ?? '', /fora da lista de teste/);
    } finally { parar(); }
    assert.equal(chamadas, 1);
  });

  test('CA2: reserva interrompida no envio real vira incerta; no simulado volta à fila e é enviada', async () => {
    const real = await programar();
    const simulado = await programar();
    // Simula a queda do processo durante a chamada: reserva e tentativa abertas há 2 minutos.
    const antigo = new Date(Date.now() - 120_000);
    for (const [id, modo, canal] of [[real, 'real', 'whatsapp'], [simulado, 'simulado', 'log']] as const) {
      const l = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } });
      await prisma.tentativaEnvio.create({ data: { idLembrete: l.id, idConsulta: id, numero: 1, canal, modo, iniciadaEm: antigo } });
      await prisma.$executeRaw`UPDATE lembretes SET status = 'enviando', atualizado_em = ${antigo} WHERE id = ${l.id}`;
    }
    assert.equal(await rotina.recuperarReservasExpiradas(60_000), 2);

    const lr = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: real } });
    assert.equal(lr.status, 'incerto');
    assert.equal(lr.motivoFalha, rotina.MOTIVO_INTERROMPIDO);
    assert.equal(lr.tentativas, 1);
    const [tr] = await prisma.tentativaEnvio.findMany({ where: { idConsulta: real } });
    assert.equal(tr.resultado, 'indeterminado');

    const ls = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: simulado } });
    assert.equal(ls.status, 'programado');
    assert.equal((await prisma.tentativaEnvio.findFirstOrThrow({ where: { idConsulta: simulado } })).resultado, 'falhou');
    assert.equal(await rotina.recuperarReservasExpiradas(60_000), 0, 'nada a recuperar na segunda passada');

    // Reserva recente (chamada possivelmente viva) não é tocada.
    const vivo = await programar();
    const lv = await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: vivo } });
    await prisma.lembrete.update({ where: { id: lv.id }, data: { status: 'enviando' } });
    assert.equal(await rotina.recuperarReservasExpiradas(60_000), 0);
    assert.equal((await prisma.lembrete.findUniqueOrThrow({ where: { id: lv.id } })).status, 'enviando');
    await prisma.lembrete.update({ where: { id: lv.id }, data: { status: 'cancelado' } });
  });

  test('CA3: a recepção reenvia um envio incerto; a decisão fica registrada e o envio segue o fluxo normal', async () => {
    const id = await programar();
    const pararIncerto = rotina.iniciarRotinaEnvio(canalQue(async () => { throw new EnvioIncerto('Sem resposta'); }), 10, 3);
    try { await esperar(id, ['incerto']); } finally { pararIncerto(); }

    assert.equal((await resolver(id, { acao: 'reenviar' })).status, 400, 'sem solicitante');
    assert.equal((await resolver(id, { acao: 'apagar', solicitante: 'Juliana' })).status, 400);
    const ok = await resolver(id, { acao: 'reenviar', solicitante: 'Juliana (recepção)' });
    assert.equal(ok.status, 201);
    assert.equal(ok.corpo.lembrete.status, 'programado');
    assert.equal((await resolver(id, { acao: 'reenviar', solicitante: 'Juliana' })).status, 409, 'não resolve duas vezes');

    const pararOk = rotina.iniciarRotinaEnvio(canalQue(async () => ({ status: 'aceito_provedor', modoEnvio: 'real', canalEnvio: 'whatsapp', idExterno: 'wamid.reenvio' })), 10, 3);
    try { assert.equal((await esperar(id, ['aceito_provedor'])).status, 'aceito_provedor'); } finally { pararOk(); }

    const trilha = await (await fetch(`${base}/lembretes/${id}/trilha`)).json();
    assert.deepEqual(trilha.tentativas.map((t: { resultado: string }) => t.resultado), ['indeterminado', 'aceito_provedor']);
    assert.equal(trilha.resolucoes.length, 1);
    assert.equal(trilha.resolucoes[0].acao, 'reenviar');
    assert.equal(trilha.resolucoes[0].solicitante, 'Juliana (recepção)');
    assert.ok(trilha.atividades.some((a: { acao: string }) => a.acao === 'lembrete.reenvio_solicitado'));
  });

  test('CA3: manter sem reenvio preserva a incerteza, registra quem decidiu e encerra as ações', async () => {
    const id = await programar();
    const parar = rotina.iniciarRotinaEnvio(canalQue(async () => { throw new EnvioIncerto('Sem resposta do WhatsApp'); }), 10, 3);
    try { await esperar(id, ['incerto']); } finally { parar(); }
    const r = await resolver(id, { acao: 'manter_sem_reenvio', solicitante: 'Juliana' });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.lembrete.status, 'incerto', 'continua sem confirmação: não vira sucesso nem falha');
    assert.ok(r.corpo.lembrete.incertoResolvidoEm);
    assert.match(r.corpo.lembrete.motivoFalha, /Mantido sem reenvio por Juliana/);
    assert.equal((await resolver(id, { acao: 'reenviar', solicitante: 'Juliana' })).status, 409);
  });

  test('CA3: cancelar a consulta não esconde um envio incerto; resolução exige situação incerta e consulta futura', async () => {
    const id = await programar();
    const parar = rotina.iniciarRotinaEnvio(canalQue(async () => { throw new EnvioIncerto('Sem resposta'); }), 10, 3);
    try { await esperar(id, ['incerto']); } finally { parar(); }
    await prisma.$transaction((tx) => servico.cancelar(tx, payload(id), `${id}-cancelada`));
    assert.equal((await prisma.lembrete.findUniqueOrThrow({ where: { idConsulta: id } })).status, 'incerto');
    const atividade = await prisma.atividade.findFirstOrThrow({ where: { idConsulta: id, acao: 'lembrete.cancelado' } });
    assert.match(atividade.descricao, /segue sem confirmação/);

    const programado = await programar(48);
    const naoIncerto = await resolver(programado, { acao: 'reenviar', solicitante: 'Juliana' });
    assert.equal(naoIncerto.status, 409);
    assert.match(naoIncerto.corpo.erro, /Só um envio sem confirmação/);

    // Consulta que já começou: reenviar não faz sentido.
    const passada = await programar();
    await prisma.lembrete.update({ where: { idConsulta: passada }, data: { status: 'incerto', inicioConsulta: new Date(Date.now() - 60_000) } });
    assert.equal((await resolver(passada, { acao: 'reenviar', solicitante: 'Juliana' })).status, 409);
    assert.equal((await resolver(crypto.randomUUID(), { acao: 'reenviar', solicitante: 'Juliana' })).status, 404);
  });

  test('GET /envio/configuracao informa o modo sem credenciais nem telefones', async () => {
    const r = await fetch(`${base}/envio/configuracao`);
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.ok(['real', 'simulado'].includes(corpo.modo));
    assert.equal(typeof corpo.motivo, 'string');
    assert.equal(typeof corpo.antecedenciaMinutos, 'number');
    assert.ok(!('token' in corpo) && !('phoneNumberId' in corpo));
  });
});
