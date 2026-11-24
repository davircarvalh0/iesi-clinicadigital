import { config } from '../config';
import type { CanalEnvio } from './canal-envio';
import { CanalLog } from './canal-log';
import { CanalWhatsApp } from './canal-whatsapp';

export function criarCanalEnvio({ canalEnvio, whatsapp }: Pick<typeof config, 'canalEnvio' | 'whatsapp'> = config): CanalEnvio {
  if (canalEnvio === 'whatsapp') {
    if (whatsapp.token.trim() && whatsapp.phoneNumberId.trim()) {
      return new CanalWhatsApp(whatsapp);
    }
    console.warn('[canais] CANAL_ENVIO=whatsapp sem credenciais; usando envio simulado em log');
  }
  return new CanalLog();
}

export type { CanalEnvio, MensagemLembrete } from './canal-envio';
