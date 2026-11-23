import type { CanalEnvio, MensagemLembrete, ResultadoEnvio } from './canal-envio';

/** Envio simulado selecionado na configuração ou na ausência de credenciais. */
export class CanalLog implements CanalEnvio {
  readonly nome = 'log';

  async enviar(_m: MensagemLembrete): Promise<ResultadoEnvio> {
    console.log('[canal-log] envio simulado concluído; dados pessoais omitidos');
    return { status: 'simulado', modoEnvio: 'simulado', canalEnvio: 'log', idExterno: null };
  }
}
