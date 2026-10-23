import type { CanalEnvio, MensagemLembrete, ResultadoEnvio } from './canal-envio';

/** Envio simulado: só registra no log. Usado sem credenciais ou quando a API está fora. */
export class CanalLog implements CanalEnvio {
  readonly nome = 'log';

  async enviar(m: MensagemLembrete): Promise<ResultadoEnvio> {
    console.log(
      `[canal-log] lembrete para ${m.pacienteNome} (${m.telefone}): ${m.especialidade} com ${m.profissional} em ${m.inicioConsulta.toISOString()}`,
    );
    return { idExterno: `log-${Date.now()}` };
  }
}
