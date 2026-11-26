// US-19: reproduz a execução do protótipo em um ambiente limpo e isolado e registra a evidência.
//
// Uso: npm run ambiente:limpo [-- --manter] [-- --sem-cache]
//   --manter     deixa o ambiente no ar ao final (para abrir a tela); sem ele, remove containers e volumes do projeto isolado.
//   --sem-cache  reconstrói as imagens sem cache de build e baixa as imagens base de novo.
//
// Roteiro:
//   1. Apaga só o projeto Compose isolado (nunca o projeto padrão da equipe) e registra versões.
//   2. Execução 1: `up --build --wait` com a configuração de exemplo (.env.example), confere migrações,
//      saúde pela recepção e roda a carga fictícia (npm run demo:popular).
//   3. Execução 2: `down` SEM apagar volumes e o mesmo `up`: confere que nada foi migrado de novo,
//      que os dados continuam lá e que a carga não duplica.
//   4. Grava docs/evidencias/us19-ambiente-limpo.txt com comandos, versões, saídas e resultado (sanitizados).
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { hostname, release, type, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = new Set(process.argv.slice(2));
const PROJETO = process.env.US19_PROJETO ?? 'iesi-clinicadigital-us19-limpo';
const SAIDA = join(RAIZ, 'docs', 'evidencias', 'us19-ambiente-limpo.txt');
if (PROJETO === 'iesi-clinicadigital') throw new Error('Use um projeto isolado: este roteiro apaga os volumes do projeto.');

// Portas próprias, para não colidir com o projeto padrão nem com outros testes no ar.
const PORTAS = {
  RECEPCAO_PORTA: '18080', AGENDAMENTO_PORTA: '13001', NOTIFICACAO_PORTA: '13002', CADASTRO_PORTA: '13003',
  RABBITMQ_PORTA: '25672', RABBITMQ_PAINEL_PORTA: '25673',
  DB_AGENDAMENTO_PORTA: '15433', DB_NOTIFICACAO_PORTA: '15434', DB_CADASTRO_PORTA: '15435',
};
for (const chave of Object.keys(PORTAS)) PORTAS[chave] = process.env[`US19_${chave}`] ?? PORTAS[chave];
const BASE = `http://localhost:${PORTAS.RECEPCAO_PORTA}`;
const ENV = { ...process.env, ...PORTAS, COMPOSE_PROJECT_NAME: PROJETO, AUTH_SECRET: randomBytes(32).toString('hex'), ADMIN_EMAIL: 'administrador@teste.invalid', ADMIN_SENHA: randomBytes(24).toString('hex'), TEST_CONTROLS: 'true' };
const COMPOSE = ['compose', '-p', PROJETO, '--env-file', '.env.example'];
const SERVICOS = ['agendamento', 'notificacao', 'cadastro'];

// ---------- registro sanitizado ----------
const registro = [];
const inicio = new Date();
const usuario = userInfo().username;
const SUBSTITUICOES = [
  [RAIZ, '<repo>'], [RAIZ.replaceAll('\\', '/'), '<repo>'], [hostname(), '<host>'],
  ...(usuario.length > 2 ? [[usuario, '<usuario>']] : []),
];
function sanitizar(texto) {
  let t = String(texto);
  for (const [de, para] of SUBSTITUICOES) t = t.split(de).join(para);
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/(?<![\w-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\w-])/g, '<cpf>')
    .replace(/(?<![\w-])\(?\d{2}\)?\s?9\d{4}-?\d{4}(?![\w-])/g, '<telefone>')
    .replace(/(WHATSAPP_TOKEN=)\S+/g, '$1<omitido>');
}
const anotar = (linha = '') => { const s = sanitizar(linha); registro.push(s); console.log(s); };
const secao = (titulo) => anotar(`\n=== ${titulo} ===`);

function executar(cmd, args, { silencioso = false, permitirFalha = false, timeoutMs = 900_000 } = {}) {
  return new Promise((ok, falha) => {
    if (!silencioso) anotar(`$ ${cmd} ${args.join(' ')}`);
    const filho = spawn(cmd, args, { cwd: RAIZ, env: ENV, windowsHide: true });
    let saida = '';
    const timer = setTimeout(() => filho.kill(), timeoutMs);
    filho.stdout.on('data', (d) => { saida += d; });
    filho.stderr.on('data', (d) => { saida += d; });
    filho.on('error', (e) => { clearTimeout(timer); falha(e); });
    filho.on('close', (codigo) => {
      clearTimeout(timer);
      const texto = saida.replace(/\r/g, '').trimEnd();
      if (codigo !== 0 && !permitirFalha) {
        anotar(texto.split('\n').slice(-40).join('\n'));
        return falha(new Error(`${cmd} ${args.join(' ')} terminou com código ${codigo}`));
      }
      ok({ codigo, texto });
    });
  });
}
const compose = (args, opcoes) => executar('docker', [...COMPOSE, ...args], opcoes);
const psql = (servico, sql) => compose(['exec', '-T', `db-${servico}`, 'psql', '-U', servico, '-d', servico, '-tAc', sql], { silencioso: true })
  .then((r) => r.texto.trim());

const verificacoes = [];
function verificar(criterio, descricao, condicao, detalhe = '') {
  verificacoes.push({ criterio, descricao, ok: Boolean(condicao) });
  anotar(`[${condicao ? 'OK' : 'FALHOU'}] ${criterio}: ${descricao}${detalhe ? ` (${detalhe})` : ''}`);
}

async function cronometrar(rotulo, fn) {
  const t0 = Date.now();
  const r = await fn();
  anotar(`(${rotulo}: ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return r;
}

// ---------- verificações reutilizadas nas duas execuções ----------
const migracoesEsperadas = Object.fromEntries(SERVICOS.map((s) => [s,
  readdirSync(join(RAIZ, 'services', s, 'prisma', 'migrations'), { withFileTypes: true }).filter((d) => d.isDirectory()).length]));

async function conferirServicos(criterio) {
  const { texto } = await compose(['ps', '--format', '{{.Service}}\t{{.State}}\t{{.Health}}'], { silencioso: true });
  anotar(texto);
  const linhas = texto.split('\n').filter(Boolean).map((l) => l.split('\t'));
  const esperados = ['rabbitmq', 'db-agendamento', 'db-notificacao', 'db-cadastro', ...SERVICOS, 'recepcao'];
  const saudaveis = esperados.filter((s) => linhas.some(([nome, estado, saude]) => nome === s && estado === 'running' && saude === 'healthy'));
  verificar(criterio, `${esperados.length} containers em execução e healthy`, saudaveis.length === esperados.length, `${saudaveis.length}/${esperados.length}`);

  for (const s of SERVICOS) {
    const aplicadas = Number(await psql(s, 'select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null'));
    verificar(criterio, `migrações de ${s} aplicadas`, aplicadas === migracoesEsperadas[s], `${aplicadas}/${migracoesEsperadas[s]}`);
  }

  for (const s of SERVICOS) {
    const r = await fetch(`${BASE}/api/${s}/saude`, { signal: AbortSignal.timeout(8000) }).catch((e) => ({ ok: false, status: e.message }));
    verificar(criterio, `recepção encaminha /api/${s}/saude`, r.ok, `HTTP ${r.status}`);
  }
  const tela = await fetch(BASE, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const html = tela?.ok ? await tela.text() : '';
  verificar(criterio, 'tela da recepção disponível', html.includes('id="root"'), `HTTP ${tela?.status ?? 'sem resposta'}`);
}

async function logsMigracao() {
  const linhas = [];
  for (const s of SERVICOS) {
    const { texto } = await compose(['logs', '--no-color', '--no-log-prefix', s], { silencioso: true });
    const relevantes = texto.split('\n')
      .filter((l) => /migrations found|Applying migration|successfully applied|No pending migrations|ouvindo/i.test(l));
    linhas.push(...relevantes.map((l) => `${s}: ${l.trim()}`));
  }
  linhas.forEach((l) => anotar(l));
  return linhas;
}

const contagens = async () => Object.fromEntries(await Promise.all([
  ['consultas', 'agendamento', 'select count(*) from consultas'],
  ['outbox_agendamento', 'agendamento', 'select count(*) from outbox'],
  ['pacientes', 'cadastro', 'select count(*) from pacientes'],
  ['lembretes', 'notificacao', 'select count(*) from lembretes'],
  ['eventos_processados', 'notificacao', 'select count(*) from eventos_processados'],
].map(async ([nome, s, sql]) => [nome, Number(await psql(s, sql))])));

const popular = () => executar('node', ['scripts/popular-demo.mjs'], { timeoutMs: 180_000 })
  .then((r) => { r.texto.split('\n').forEach((l) => anotar(l)); return r.texto; });

// ---------- roteiro ----------
let erro;
try {
  secao('Contexto');
  anotar(`Data: ${inicio.toISOString()} (America/Recife: ${inicio.toLocaleString('pt-BR', { timeZone: 'America/Recife' })})`);
  anotar(`Projeto Compose isolado: ${PROJETO}; configuração: .env.example; recepção em ${BASE}`);
  anotar(`Portas: ${Object.entries(PORTAS).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  const commit = (await executar('git', ['rev-parse', 'HEAD'], { silencioso: true })).texto;
  const branch = (await executar('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { silencioso: true })).texto;
  // O próprio arquivo de evidência não conta como alteração do código testado.
  const sujo = (await executar('git', ['status', '--porcelain'], { silencioso: true })).texto
    .split('\n').filter((l) => l.trim() && !l.endsWith('docs/evidencias/us19-ambiente-limpo.txt')).join('\n');
  anotar(`Commit: ${commit} (${branch})${sujo ? ' + alterações locais não commitadas' : ''}`);

  secao('Versões das ferramentas');
  anotar(`SO: ${type()} ${release()}; Node ${process.version}`);
  anotar(`npm ${/npm\/(\S+)/.exec(process.env.npm_config_user_agent ?? '')?.[1] ?? '? (rode via npm run ambiente:limpo)'}`);
  anotar((await executar('docker', ['version', '--format', 'Docker cliente {{.Client.Version}}; servidor {{.Server.Version}} ({{.Server.Os}}/{{.Server.Arch}})'], { silencioso: true })).texto);
  anotar((await executar('docker', ['compose', 'version'], { silencioso: true })).texto);

  secao('Preparação: ambiente limpo');
  await compose(['down', '--volumes', '--remove-orphans']);
  const { texto: volumes } = await executar('docker', ['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${PROJETO}`], { silencioso: true });
  verificar('CA1', 'nenhum volume do projeto isolado antes da execução', volumes === '', volumes || 'zero volumes');
  if (ARGS.has('--sem-cache')) await cronometrar('build sem cache', () => compose(['build', '--pull', '--no-cache']));

  secao('Execução 1: compilar, migrar e subir (banco vazio)');
  await cronometrar('up execução 1', () => compose(['up', '-d', '--build', '--wait', '--wait-timeout', '300']));
  await conferirServicos('CA1');
  const logs1 = await logsMigracao();
  verificar('CA1', 'logs mostram migrações aplicadas na criação dos bancos',
    SERVICOS.every((s) => logs1.some((l) => l.startsWith(`${s}:`) && /applied|Applying migration/i.test(l))));
  const vazio = await contagens();
  anotar(`Contagens antes da carga: ${JSON.stringify(vazio)}`);
  verificar('CA2', 'bancos começam sem dados', Object.values(vazio).every((n) => n === 0));

  secao('Execução 1: carga de dados fictícios');
  const carga1 = await cronometrar('carga', popular);
  const depoisCarga = await contagens();
  anotar(`Contagens depois da carga: ${JSON.stringify(depoisCarga)}`);
  verificar('CA2', 'carga criou 6 consultas, 5 pacientes e 6 lembretes',
    depoisCarga.consultas === 6 && depoisCarga.pacientes === 5 && depoisCarga.lembretes === 6, JSON.stringify(depoisCarga));
  verificar('CA2', 'carga documenta como obter as evidências', carga1.includes('Como obter as evidências'));
  const cpfsReais = Number(await psql('cadastro', "select count(*) from pacientes where cpf not like '000000%'"));
  verificar('CA2', 'Cadastro só contém CPFs da faixa fictícia 000.000.xxx', cpfsReais === 0, `${cpfsReais} fora da faixa`);

  secao('Execução 2: derrubar SEM apagar volumes e subir com o mesmo comando');
  await compose(['down']);
  await cronometrar('up execução 2', () => compose(['up', '-d', '--build', '--wait', '--wait-timeout', '300']));
  await conferirServicos('CA3');
  const logs2 = await logsMigracao();
  verificar('CA3', 'nenhuma migração reaplicada (No pending migrations em todos os serviços)',
    SERVICOS.every((s) => logs2.some((l) => l.startsWith(`${s}:`) && /No pending migrations/i.test(l))));
  const depoisReinicio = await contagens();
  anotar(`Contagens depois da segunda subida: ${JSON.stringify(depoisReinicio)}`);
  verificar('CA3', 'dados preservados entre as execuções', JSON.stringify(depoisReinicio) === JSON.stringify(depoisCarga));
  const carga2 = await popular();
  const depoisCarga2 = await contagens();
  verificar('CA3', 'segunda carga não duplica dados', carga2.includes('nada foi gravado')
    && JSON.stringify(depoisCarga2) === JSON.stringify(depoisCarga), JSON.stringify(depoisCarga2));

  secao('Versões efetivas das imagens');
  const { texto: imagens } = await compose(['images', '--format', 'json'], { silencioso: true });
  const vistas = new Set();
  for (const i of JSON.parse(imagens)) {
    const chave = `${i.Repository}:${i.Tag}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    const { texto: digest } = await executar('docker', ['image', 'inspect', '--format', '{{if .RepoDigests}}{{index .RepoDigests 0}}{{else}}{{.Id}}{{end}}', chave], { silencioso: true, permitirFalha: true });
    anotar(`${chave.padEnd(52)} ${digest}`);
  }
  anotar(`PostgreSQL: ${await psql('agendamento', 'show server_version')}`);
  anotar(`RabbitMQ: ${(await compose(['exec', '-T', 'rabbitmq', 'rabbitmqctl', 'version'], { silencioso: true })).texto}`);
  anotar(`Node nos serviços: ${(await compose(['exec', '-T', 'agendamento', 'node', '-v'], { silencioso: true })).texto}`);
  anotar(`Prisma: ${(await compose(['exec', '-T', 'agendamento', 'npx', 'prisma', '-v'], { silencioso: true })).texto.split('\n').find((l) => l.startsWith('prisma')) ?? '?'}`);
  anotar(`nginx: ${(await compose(['exec', '-T', 'recepcao', 'nginx', '-v'], { silencioso: true })).texto}`);
} catch (e) {
  erro = e;
  anotar(`\nERRO: ${e.message}`);
  await compose(['ps', '-a'], { permitirFalha: true }).then((r) => anotar(r.texto)).catch(() => {});
} finally {
  secao('Resultado');
  const falhas = verificacoes.filter((v) => !v.ok);
  for (const ca of ['CA1', 'CA2', 'CA3']) {
    const doCa = verificacoes.filter((v) => v.criterio === ca);
    anotar(`${ca}: ${doCa.length && doCa.every((v) => v.ok) ? 'APROVADO' : 'REPROVADO'} (${doCa.filter((v) => v.ok).length}/${doCa.length} verificações)`);
  }
  const aprovado = !erro && falhas.length === 0;
  anotar(`Resultado geral: ${aprovado ? 'APROVADO' : 'REPROVADO'}; duração ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
  if (ARGS.has('--manter')) {
    anotar(`Ambiente mantido no ar: ${BASE}. Para remover: docker compose -p ${PROJETO} down -v`);
  } else {
    await compose(['down', '--volumes', '--remove-orphans'], { permitirFalha: true });
    anotar('Ambiente isolado removido (containers e volumes do projeto de teste).');
  }
  mkdirSync(dirname(SAIDA), { recursive: true });
  writeFileSync(SAIDA, `${registro.join('\n').trimStart()}\n`);
  console.log(`\nEvidência gravada em ${SAIDA}`);
  process.exitCode = aprovado ? 0 : 1;
}
