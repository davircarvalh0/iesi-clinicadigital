import type { CanalEnvio, MensagemLembrete, ResultadoEnvio } from './canal-envio';

/** Envio simulado: só registra no log. Usado sem credenciais ou quando a API está fora. */
export class CanalLog implements CanalEnvio {
  readonly nome = 'log';

  async enviar(_m: MensagemLembrete): Promise<ResultadoEnvio> {
    console.log('[canal-log] envio simulado concluído; dados pessoais omitidos');
    return { idExterno: `log-${Date.now()}` };
  }
}
