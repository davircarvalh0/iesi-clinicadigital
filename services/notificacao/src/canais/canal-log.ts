import type { CanalEnvio, MensagemLembrete, ResultadoEnvio } from './canal-envio';
import { destinatarioEmail } from './canal-email';

/** Envio simulado selecionado na configuração ou na ausência de credenciais. */
export class CanalLog implements CanalEnvio {
  readonly nome: 'log' | 'email';
  readonly simulado = true;
  // Simula o WhatsApp: exige a mesma autorização do envio real.
  constructor(readonly canalContato: 'whatsapp' | 'email' = 'whatsapp') {
    this.nome = canalContato === 'email' ? 'email' : 'log';
  }

  async enviar(_m: MensagemLembrete): Promise<ResultadoEnvio> {
    if (this.canalContato === 'email') destinatarioEmail(_m.email);
    console.log('[canal-log] envio simulado concluído; dados pessoais omitidos');
    return { status: 'simulado', modoEnvio: 'simulado', canalEnvio: this.nome, idExterno: null };
  }
}
