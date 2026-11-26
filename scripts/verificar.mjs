// US-20: verificação reproduzível de todo o protótipo em um comando, com evidência gravada.
//
// Uso: npm run verificar [-- --rapido] [-- --manter] [-- --sem-relatorio]
//   --rapido         só a etapa estática (typecheck, build, testes unitários); não usa Docker.
//   --manter         deixa o Compose isolado no ar ao final (recepção em http://localhost:38080).
//   --sem-relatorio  não grava docs/evidencias/verificacao.md (útil na CI, que guarda o log).
//
// Etapas (cada uma registra comando, resultado, contagem de testes e duração):
//   1. Estática: npm run typecheck, npm run build, npm test (unitários, sem banco).
//   2. Ambiente: Compose isolado (projeto e portas próprios, .env.example, CANAL_ENVIO=log), do zero.
//   3. Banco: bancos de teste separados dos serviços, migrações aplicadas, suítes de banco da
//      Notificação e do Cadastro.
//   4. Integração: carga fictícia (US-19) e todos os roteiros scripts/*.integracao.test.mjs, um por vez.
//   5. Limpeza: remove containers e volumes do projeto isolado (exceto com --manter).
// Termina com código 1 se qualquer etapa falhar.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contarTestes } from './contar-testes.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = new Set(process.argv.slice(2));
const RAPIDO = ARGS.has('--rapido');
const MANTER = ARGS.has('--manter');
const PROJETO = process.env.VERIFICAR_PROJETO ?? 'iesi-clinicadigital-verificacao';
if (PROJETO === 'iesi-clinicadigital') throw new Error('Use um projeto isolado: a verificação apaga os volumes do projeto.');
const SAIDA = join(RAIZ, 'docs', 'evidencias', 'verificacao.md');

const PORTAS = {
  RECEPCAO_PORTA: '38080', AGENDAMENTO_PORTA: '33001', NOTIFICACAO_PORTA: '33002', CADASTRO_PORTA: '33003',
  RABBITMQ_PORTA: '36672', RABBITMQ_PAINEL_PORTA: '36673',
  DB_AGENDAMENTO_PORTA: '35433', DB_NOTIFICACAO_PORTA: '35434', DB_CADASTRO_PORTA: '35435',
};
for (const chave of Object.keys(PORTAS)) PORTAS[chave] = process.env[`VERIFICAR_${chave}`] ?? PORTAS[chave];

const BANCO_TESTE = {
  notificacao: `postgresql://notificacao:notificacao@localhost:${PORTAS.DB_NOTIFICACAO_PORTA}/notificacao_teste`,
  cadastro: `postgresql://cadastro:cadastro@localhost:${PORTAS.DB_CADASTRO_PORTA}/cadastro_teste`,
};
// Ambiente dos comandos: o Compose isolado e os endereços que os roteiros de teste leem.
const ENV_BASE = {
  ...process.env,
  ...PORTAS,
  COMPOSE_PROJECT_NAME: PROJETO,
  CANAL_ENVIO: 'log',
  OPERACAO_HABILITADA: 'true',
  LEMBRETE_ANTECEDENCIA_MINUTOS: '1440',
  TEST_BASE_URL: `http://localhost:${PORTAS.RECEPCAO_PORTA}`,
  TEST_RABBITMQ_URL: `amqp://clinica:clinica@localhost:${PORTAS.RABBITMQ_PORTA}`,
  TEST_CADASTRO_URL: `http://localhost:${PORTAS.CADASTRO_PORTA}`,
  DEMO_BASE_URL: `http://localhost:${PORTAS.RECEPCAO_PORTA}`,
};
delete ENV_BASE.TEST_DATABASE_URL; // a etapa estática roda sem banco, de propósito
const COMPOSE = ['compose', '-p', PROJETO, '--env-file', '.env.example'];

// ---------- execução e registro ----------
const usuario = userInfo().username;
const SUBSTITUICOES = [[RAIZ, '<repo>'], [RAIZ.replaceAll('\\', '/'), '<repo>'], [hostname(), '<host>'],
  ...(usuario.length > 2 ? [[usuario, '<usuario>']] : [])];
const sanitizar = (texto) => SUBSTITUICOES.reduce((t, [de, para]) => t.split(de).join(para), String(texto));

const etapas = [];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function rodar(cmd, args, { env = {}, timeoutMs = 900_000, cwd = RAIZ } = {}) {
  return new Promise((ok) => {
    // No Windows, npm.cmd e npx.cmd só rodam por um shell; os argumentos deles não têm espaços.
    const viaShell = cmd.endsWith('.cmd');
    const filho = viaShell
      ? spawn([cmd, ...args].join(' '), { cwd, env: { ...ENV_BASE, ...env }, windowsHide: true, shell: true })
      : spawn(cmd, args, { cwd, env: { ...ENV_BASE, ...env }, windowsHide: true });
    let saida = '';
    const timer = setTimeout(() => { saida += '\n[verificar] tempo esgotado'; filho.kill(); }, timeoutMs);
    filho.stdout.on('data', (d) => { saida += d; });
    filho.stderr.on('data', (d) => { saida += d; });
    filho.on('error', (e) => { clearTimeout(timer); ok({ codigo: -1, saida: `${saida}\n${e.message}` }); });
    filho.on('close', (codigo) => { clearTimeout(timer); ok({ codigo, saida: saida.replace(/\r/g, '') }); });
  });
}

async function etapa(grupo, nome, cmd, args, opcoes = {}) {
  const t0 = Date.now();
  process.stdout.write(`[verificar] ${grupo} · ${nome} … `);
  const { codigo, saida } = await rodar(cmd, args, opcoes);
  const testes = contarTestes(saida);
  const ok = codigo === 0 && (!testes || testes.fail === 0);
  const registro = { grupo, nome, comando: sanitizar(`${cmd.replace('.cmd', '')} ${args.join(' ')}`), ok, testes, segundos: (Date.now() - t0) / 1000 };
  etapas.push(registro);
  console.log(`${ok ? 'OK' : 'FALHOU'} (${registro.segundos.toFixed(1)} s${testes ? `; ${testes.pass}/${testes.total} aprovados, ${testes.skipped} pulados` : ''})`);
  if (!ok) console.log(sanitizar(saida.split('\n').slice(-40).join('\n')));
  return ok;
}

const pular = (grupo, nome, motivo) => {
  etapas.push({ grupo, nome, comando: '—', ok: false, pulada: motivo, testes: null, segundos: 0 });
  console.log(`[verificar] ${grupo} · ${nome} … PULADA (${motivo})`);
};

// ---------- roteiro ----------
const inicio = new Date();
const commit = (await rodar('git', ['rev-parse', '--short', 'HEAD'])).saida.trim();
const sujo = (await rodar('git', ['status', '--porcelain'])).saida.trim() !== '';
const versoes = {
  node: process.version,
  npm: (await rodar(npm, ['--version'])).saida.trim(),
  docker: RAPIDO ? '—' : (await rodar('docker', ['version', '--format', '{{.Server.Version}}'])).saida.trim().split('\n')[0],
  compose: RAPIDO ? '—' : (await rodar('docker', ['compose', 'version', '--short'])).saida.trim(),
};
console.log(`[verificar] commit ${commit}${sujo ? ' (com alterações locais)' : ''}; projeto ${PROJETO}`);

await etapa('1. Estática', 'Typecheck de todos os workspaces', npm, ['run', 'typecheck']);
await etapa('1. Estática', 'Build de todos os workspaces', npm, ['run', 'build']);
await etapa('1. Estática', 'Testes unitários (sem banco)', npm, ['test']);
await etapa('1. Estática', 'Testes dos roteiros (dados fictícios e contagem)', npm, ['run', 'test:scripts']);

if (!RAPIDO) {
  await rodar('docker', [...COMPOSE, 'down', '-v', '--remove-orphans'], { timeoutMs: 300_000 });
  const noAr = await etapa('2. Ambiente', 'Compose isolado do zero (up --build --wait)', 'docker', [...COMPOSE, 'up', '-d', '--build', '--wait'], { timeoutMs: 1_200_000 });

  if (noAr) {
    // Bancos de teste separados dos bancos que os serviços usam: os testes de banco ligam a própria rotina de envio.
    for (const [servico, url] of Object.entries(BANCO_TESTE)) {
      const banco = new URL(url).pathname.slice(1);
      await rodar('docker', [...COMPOSE, 'exec', '-T', `db-${servico}`, 'psql', '-U', servico, '-d', servico, '-c', `DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`]);
      await etapa('3. Banco', `Banco ${banco}: criar`, 'docker', [...COMPOSE, 'exec', '-T', `db-${servico}`, 'psql', '-U', servico, '-d', servico, '-c', `CREATE DATABASE ${banco}`]);
      await etapa('3. Banco', `Banco ${banco}: migrações`, npx, ['prisma', 'migrate', 'deploy'], { cwd: join(RAIZ, 'services', servico), env: { DATABASE_URL: url } });
    }
    await etapa('3. Banco', 'Notificação: suíte completa com banco', npm, ['test', '-w', '@clinica/notificacao'], { env: { TEST_DATABASE_URL: BANCO_TESTE.notificacao } });
    for (const [script, flag] of [['test:us01:db', 'TEST_US01_DB'], ['test:us02:api', 'TEST_US02_DB'], ['test:us14:db', 'TEST_US14_DB']]) {
      await etapa('3. Banco', `Cadastro: ${script}`, npm, ['run', script, '-w', '@clinica/cadastro'], { env: { DATABASE_URL: BANCO_TESTE.cadastro, [flag]: '1' } });
    }

    await etapa('4. Integração', 'Carga fictícia (npm run demo:popular)', 'node', ['scripts/popular-demo.mjs']);
    const roteiros = readdirSync(join(RAIZ, 'scripts')).filter((f) => /^us\d+\.integracao\.test\.mjs$/.test(f)).sort();
    for (const arquivo of roteiros) {
      const us = arquivo.match(/^us(\d+)/)[1];
      await etapa('4. Integração', `US-${us}`, 'node', ['--test', '--test-timeout=300000', `scripts/${arquivo}`], { timeoutMs: 600_000 });
    }
    await etapa('4. Integração', 'US-01: reinício do Cadastro', 'node', ['--test', 'scripts/us01.reinicio.test.mjs'], { env: { TEST_US01_REINICIO: '1' } });
  } else {
    for (const g of ['3. Banco', '4. Integração']) pular(g, 'todas', 'o Compose isolado não subiu');
  }

  if (MANTER) console.log(`[verificar] ambiente mantido no ar: http://localhost:${PORTAS.RECEPCAO_PORTA}`);
  else await rodar('docker', [...COMPOSE, 'down', '-v', '--remove-orphans'], { timeoutMs: 300_000 });
}

// ---------- relatório ----------
const falhas = etapas.filter((e) => !e.ok);
const totais = etapas.reduce((t, e) => (e.testes ? { total: t.total + e.testes.total, pass: t.pass + e.testes.pass, skipped: t.skipped + e.testes.skipped } : t), { total: 0, pass: 0, skipped: 0 });
const veredito = falhas.length ? `**FALHOU**: ${falhas.length} etapa(s) com problema` : '**APROVADA**: todas as etapas passaram';
const linhas = [
  '# Verificação reproduzível (US-20)',
  '',
  `Gerado por \`npm run verificar${RAPIDO ? ' -- --rapido' : ''}\` em ${inicio.toISOString()} (duração ${((Date.now() - inicio.getTime()) / 1000).toFixed(0)} s).`,
  `Commit \`${commit}\`${sujo ? ' com alterações locais não commitadas' : ''}. Projeto Compose isolado \`${PROJETO}\`, configuração \`.env.example\`, \`CANAL_ENVIO=log\`.`,
  `Versões: Node ${versoes.node}, npm ${versoes.npm}, Docker ${versoes.docker}, Compose ${versoes.compose}.`,
  '',
  `Resultado: ${veredito}. Testes: ${totais.pass} de ${totais.total} aprovados, ${totais.skipped} pulados.`,
  '',
  '| Etapa | Verificação | Resultado | Testes | Duração | Comando |',
  '| --- | --- | --- | --- | --- | --- |',
  ...etapas.map((e) => `| ${e.grupo} | ${e.nome} | ${e.pulada ? `pulada: ${e.pulada}` : e.ok ? 'OK' : 'FALHOU'} | ${e.testes ? `${e.testes.pass}/${e.testes.total}${e.testes.skipped ? ` (${e.testes.skipped} pulados)` : ''}` : '—'} | ${e.segundos.toFixed(1)} s | \`${e.comando.replaceAll('|', '\\|')}\` |`),
  '',
  RAPIDO ? 'Modo rápido: as etapas com Docker (banco e integração) não foram executadas.' : 'Os dados usados são fictícios (CPF inválido por construção, telefones na faixa 81 9 0000-0xxx). Nenhuma mensagem real é enviada.',
  '',
];
if (!ARGS.has('--sem-relatorio')) {
  mkdirSync(dirname(SAIDA), { recursive: true });
  writeFileSync(SAIDA, sanitizar(linhas.join('\n')));
  console.log(`[verificar] relatório em ${sanitizar(SAIDA)}`);
}
console.log(`[verificar] ${falhas.length ? 'FALHOU' : 'APROVADA'}: ${totais.pass}/${totais.total} testes aprovados`);
process.exit(falhas.length ? 1 : 0);
