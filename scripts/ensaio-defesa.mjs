// US-24: ensaio automático da demonstração. Confere, contra um ambiente no ar, cada resultado
// demonstrável do Product Goal, na ordem do roteiro em docs/US-24.md, usando só dados fictícios.
//
// Uso: npm run demo:ensaio            (ambiente padrão em http://localhost:8080)
//      DEMO_BASE_URL=http://localhost:18080 npm run demo:ensaio
// Termina com código 1 se algum resultado não se confirmar. Deixa as consultas fictícias criadas, para inspeção.
import { fetch } from './http-autenticado.mjs';
import { randomInt } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';
import { cpfFicticio, telefoneFicticio } from './dados-demo.mjs';

const BASE = (process.env.DEMO_BASE_URL ?? `http://localhost:${process.env.RECEPCAO_PORTA ?? 8080}`).replace(/\/$/, '');
const PRAZO_MS = Number(process.env.DEMO_PRAZO_MS ?? 45_000);
const n = randomInt(500, 999);
const PACIENTE = { nome: `Paciente Exemplo Ensaio ${n}`, cpf: cpfFicticio(n), telefone: telefoneFicticio(n) };
const emDias = (dias, hora = 10) => {
  const d = new Date(Date.now() + dias * 86_400_000);
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(d);
  return `${dia}T${String(hora).padStart(2, '0')}:00:00-03:00`;
};

async function api(rota, { method = 'GET', body } = {}) {
  const r = await fetch(`${BASE}/api/${rota}`, {
    method, signal: AbortSignal.timeout(8000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${rota}: HTTP ${r.status}${dados?.erro ? ` (${dados.erro})` : ''}`);
  return dados;
}

async function aguardar(descricao, verificar, prazo = PRAZO_MS) {
  const limite = Date.now() + prazo;
  let ultimo;
  while (Date.now() < limite) {
    try { const r = await verificar(); if (r) return r; } catch (e) { ultimo = e; }
    await esperar(500);
  }
  throw new Error(`não confirmado em ${prazo / 1000} s: ${descricao}${ultimo ? ` (${ultimo.message})` : ''}`);
}

const lembrete = async (id) => (await api(`notificacao/lembretes?consulta=${id}`))[0];
const resultados = [];
async function passo(numero, titulo, fn) {
  const t0 = Date.now();
  process.stdout.write(`${numero}. ${titulo} … `);
  try {
    const detalhe = await fn();
    resultados.push(true);
    console.log(`OK (${((Date.now() - t0) / 1000).toFixed(1)} s)${detalhe ? `\n   ${detalhe}` : ''}`);
  } catch (erro) {
    resultados.push(false);
    console.log(`FALHOU\n   ${erro.message}`);
  }
}

console.log(`Ensaio da demonstração em ${BASE} (dados fictícios: ${PACIENTE.nome})\n`);
await aguardar('serviços respondendo', async () => {
  await Promise.all(['agendamento', 'notificacao', 'cadastro'].map((s) => api(`${s}/saude`)));
  return true;
});

let idConsulta;
await passo(1, 'Consulta gera vínculo com o paciente mestre e programação do lembrete', async () => {
  const consulta = await api('agendamento/consultas', {
    method: 'POST', body: { ...PACIENTE, profissional: 'Dra. Exemplo', especialidade: 'Clínica geral', inicio: emDias(10) },
  });
  idConsulta = consulta.id;
  const vinculada = await aguardar('vínculo com o Cadastro', async () =>
    (await api('agendamento/consultas')).find((c) => c.id === idConsulta && c.idPaciente && !c.vinculoPacientePendente));
  const l = await aguardar('lembrete programado', async () => { const x = await lembrete(idConsulta); return x?.status === 'programado' && x; });
  return `paciente mestre ${vinculada.idPaciente.slice(0, 8)}…; lembrete previsto para ${l.enviarEm}`;
});

await passo(2, 'Remarcação e cancelamento se propagam', async () => {
  if (!idConsulta) throw new Error('depende do passo 1');
  const novoInicio = emDias(12, 15);
  await api(`agendamento/consultas/${idConsulta}`, { method: 'PATCH', body: { inicio: novoInicio } });
  await aguardar('lembrete reprogramado', async () =>
    new Date((await lembrete(idConsulta)).inicioConsulta).getTime() === new Date(novoInicio).getTime());
  await api(`agendamento/consultas/${idConsulta}`, { method: 'DELETE' });
  await aguardar('lembrete cancelado', async () => (await lembrete(idConsulta)).status === 'cancelado');
  return 'lembrete reprogramado para o novo horário e depois cancelado';
});

await passo(3, 'Evento duplicado não duplica o efeito', async () => {
  const { idEvento, tipo } = await api('agendamento/demo/reenviar-ultimo-evento', { method: 'POST' });
  const atividade = await aguardar('Notificação ignora o mesmo id_evento', async () =>
    (await api('notificacao/atividades?limite=100')).find((a) => a.acao === 'evento.duplicado' && a.idEvento === idEvento));
  if (atividade.idConsulta) {
    const lembretes = await api(`notificacao/lembretes?consulta=${atividade.idConsulta}`);
    if (lembretes.length !== 1) throw new Error(`esperado 1 lembrete para a consulta, há ${lembretes.length}`);
  }
  return `${tipo} reenviado com o mesmo id_evento e ignorado ("${atividade.descricao}")`;
});

await passo(4, 'Indisponibilidade da Notificação recupera o processamento', async () => {
  await api('notificacao/demo/consumo', { method: 'PUT', body: { ativo: false } });
  let id;
  try {
    id = (await api('agendamento/consultas', {
      method: 'POST', body: { ...PACIENTE, profissional: 'Dr. Exemplo', especialidade: 'Pediatria', inicio: emDias(11, 9) },
    })).id;
    await esperar(3000);
    if (await lembrete(id)) throw new Error('o lembrete surgiu com o consumo pausado');
    const { naFila } = await api('notificacao/demo/consumo');
    if (!naFila) throw new Error('o evento deveria estar esperando na fila');
  } finally {
    await api('notificacao/demo/consumo', { method: 'PUT', body: { ativo: true } });
  }
  await aguardar('lembrete processado depois da volta', async () => (await lembrete(id))?.status === 'programado');
  return 'evento esperou na fila durante a pausa e foi processado quando o serviço voltou';
});

await passo(5, 'Modo de envio explícito', async () => {
  const envio = await api('notificacao/envio/configuracao');
  if (!['real', 'simulado'].includes(envio.modo) || !envio.motivo) throw new Error('modo de envio sem descrição');
  return `${envio.modo === 'real' ? 'Envio real' : 'Envio simulado'}: ${envio.motivo}`;
});

const aprovados = resultados.filter(Boolean).length;
console.log(`\n${aprovados}/${resultados.length} resultados demonstráveis confirmados.`);
process.exit(aprovados === resultados.length ? 0 : 1);
