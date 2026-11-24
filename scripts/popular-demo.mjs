// Popula a agenda com consultas FICTÍCIAS (scripts/dados-demo.mjs), passando pela API da recepção:
// gera eventos, pacientes no Cadastro e lembretes na Notificação de verdade.
// Uso: npm run demo:popular   (com o docker compose no ar)
//
// - Banco vazio: agenda 6 consultas (5 pacientes), cancela 1 e confere a propagação nos três serviços.
// - Agenda já populada: não grava nada e só confere/mostra o resumo (pode rodar de novo sem duplicar).
// A saída mostra apenas contagens e estados, nunca nome, CPF ou telefone.
import { consultasDemo, PACIENTES_DEMO } from './dados-demo.mjs';

const BASE = (process.env.DEMO_BASE_URL ?? `http://localhost:${process.env.RECEPCAO_PORTA ?? 8080}`).replace(/\/$/, '');
const PRAZO_MS = Number(process.env.DEMO_PRAZO_MS ?? 90_000);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function chamar(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, {
    ...opcoes, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho}: HTTP ${r.status}`);
  return r.json();
}

/** Repete `verificar` até devolver algo verdadeiro ou o prazo acabar. */
async function aguardar(descricao, verificar) {
  const prazo = Date.now() + PRAZO_MS;
  let ultimoErro;
  while (Date.now() < prazo) {
    try {
      const resultado = await verificar();
      if (resultado) return resultado;
    } catch (erro) { ultimoErro = erro; }
    await esperar(1000);
  }
  throw new Error(`Tempo esgotado (${PRAZO_MS / 1000}s): ${descricao}${ultimoErro ? ` (${ultimoErro.message})` : ''}`);
}

const contar = (itens, campo) => itens.reduce((acc, i) => ({ ...acc, [i[campo]]: (acc[i[campo]] ?? 0) + 1 }), {});
const formatar = (contagem) => Object.entries(contagem).sort().map(([k, v]) => `${k}=${v}`).join(', ') || 'nenhum';

await aguardar(`recepção e serviços respondendo em ${BASE}`, async () => {
  await Promise.all(['agendamento', 'notificacao', 'cadastro'].map((s) => chamar(`/api/${s}/saude`)));
  return true;
});

const existentes = await chamar('/api/agendamento/consultas');
const cpfsDemo = new Set(PACIENTES_DEMO.map((p) => p.cpf));
let criadas = 0;
if (existentes.length) {
  console.log(`A agenda já tem ${existentes.length} consulta(s); nada foi gravado. Conferindo o estado atual.`);
} else {
  for (const { cancelar, ...dados } of consultasDemo()) {
    const consulta = await chamar('/api/agendamento/consultas', { method: 'POST', body: JSON.stringify(dados) });
    criadas += 1;
    if (cancelar) {
      // Espera o lembrete existir para o cancelamento seguir o caminho normal (programado → cancelado).
      await aguardar('lembrete da consulta a cancelar', async () =>
        (await chamar(`/api/notificacao/lembretes?consulta=${consulta.id}`)).length > 0);
      await chamar(`/api/agendamento/consultas/${consulta.id}`, { method: 'DELETE' });
    }
  }
  console.log(`Carga gravada: ${criadas} consulta(s) fictícia(s), 1 cancelada.`);
}

// Confere a propagação por eventos: Agendamento → Cadastro (vínculo) → Notificação (lembretes).
const resumo = await aguardar('propagação para Cadastro e Notificação', async () => {
  const consultas = await chamar('/api/agendamento/consultas');
  const demo = consultas.filter((c) => cpfsDemo.has(c.pacienteCpf));
  const lembretes = await chamar('/api/notificacao/lembretes');
  const { pacientes, total } = await chamar('/api/cadastro/pacientes?busca=000000&tamanhoPagina=100');
  const idsDemo = new Set(demo.map((c) => c.id));
  const lembretesDemo = lembretes.filter((l) => idsDemo.has(l.idConsulta));
  const cancelada = demo.find((c) => c.status === 'cancelada');
  const pronto = demo.length > 0
    && demo.every((c) => !c.vinculoPacientePendente && c.idPaciente)
    && lembretesDemo.length === demo.length
    && (!cancelada || lembretesDemo.find((l) => l.idConsulta === cancelada.id)?.status === 'cancelado')
    && pacientes.filter((p) => cpfsDemo.has(p.cpf)).length === new Set(demo.map((c) => c.pacienteCpf)).size;
  return pronto && { consultas, demo, lembretes, lembretesDemo, total };
});

const pacientesVinculados = new Set(resumo.demo.map((c) => c.idPaciente)).size;
console.log([
  'Resumo (somente contagens; nenhum dado pessoal):',
  `  Agendamento: ${resumo.consultas.length} consulta(s) [${formatar(contar(resumo.consultas, 'status'))}]; fictícias da carga: ${resumo.demo.length}`,
  `  Cadastro:    ${resumo.total} paciente(s) no total; ${pacientesVinculados} vinculado(s) às consultas fictícias`,
  `  Notificação: ${resumo.lembretes.length} lembrete(s) [${formatar(contar(resumo.lembretesDemo, 'status'))}]`,
  '',
  'Como obter as evidências (veja docs/US-19.md):',
  `  Tela da recepção:  ${BASE}  (agenda, feed de atividades e Pacientes)`,
  `  Consultas:         ${BASE}/api/agendamento/consultas`,
  `  Lembretes:         ${BASE}/api/notificacao/lembretes`,
  `  Pacientes:         ${BASE}/api/cadastro/pacientes?busca=000000`,
  `  Atividades:        ${BASE}/api/notificacao/atividades`,
  '  Roteiro completo:  npm run ambiente:limpo   (grava docs/evidencias/us19-ambiente-limpo.txt)',
].join('\n'));
