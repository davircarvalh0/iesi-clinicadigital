import { criarApp } from './app';
import { criarCanalEnvio } from './canais';
import { config } from './config';
import { iniciarConsumidor } from './consumidor/consumidor';
import { prisma } from './db';
import { iniciarRotinaEnvio } from './envio/rotina-envio';
import { abrirCanalConsumo, conectarRabbit } from './mensageria/conexao';

async function main() {
  let encerrando = false;
  const conexao = await conectarRabbit(config.rabbitUrl);
  // Sem reconexão automática: se o broker cair, o processo sai e o Docker o reinicia.
  conexao.on('close', () => {
    if (encerrando) return;
    console.error('[notificacao] conexão com o RabbitMQ encerrada');
    process.exit(1);
  });

  const canalRabbit = await abrirCanalConsumo(conexao);
  await iniciarConsumidor(canalRabbit, config.consumidorMaxTentativas);

  const pararRotina = iniciarRotinaEnvio(criarCanalEnvio(), config.rotinaEnvioIntervaloMs, config.envioMaxTentativas);

  const servidor = criarApp().listen(config.porta, () => {
    console.log(`[notificacao] ouvindo na porta ${config.porta} (antecedência ${config.antecedenciaMinutos} min)`);
  });

  const encerrar = async () => {
    encerrando = true;
    pararRotina();
    servidor.close();
    await conexao.close().catch(() => {});
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

main().catch((erro) => {
  console.error('[notificacao] falha ao iniciar', erro);
  process.exit(1);
});
