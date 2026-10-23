import { criarApp } from './app';
import { config } from './config';
import { prisma } from './db';
import { abrirCanalPublicacao, conectarRabbit } from './mensageria/conexao';
import { iniciarPublicador } from './outbox/publicador';

async function main() {
  let encerrando = false;
  const conexao = await conectarRabbit(config.rabbitUrl);
  // Sem reconexão automática: se o broker cair, o processo sai e o Docker o reinicia.
  conexao.on('close', () => {
    if (encerrando) return;
    console.error('[agendamento] conexão com o RabbitMQ encerrada');
    process.exit(1);
  });

  const canal = await abrirCanalPublicacao(conexao);
  const pararPublicador = iniciarPublicador(canal, config.outboxIntervaloMs);

  const servidor = criarApp().listen(config.porta, () => {
    console.log(`[agendamento] ouvindo na porta ${config.porta}`);
  });

  const encerrar = async () => {
    encerrando = true;
    pararPublicador();
    servidor.close();
    await conexao.close().catch(() => {});
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

main().catch((erro) => {
  console.error('[agendamento] falha ao iniciar', erro);
  process.exit(1);
});
