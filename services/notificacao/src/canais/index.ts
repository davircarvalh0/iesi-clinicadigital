import { config } from '../config';
import type { CanalEnvio } from './canal-envio';
import { CanalLog } from './canal-log';
import { CanalWhatsApp } from './canal-whatsapp';

export function criarCanalEnvio(): CanalEnvio {
  if (config.canalEnvio === 'whatsapp') {
    if (config.whatsapp.token && config.whatsapp.phoneNumberId) {
      return new CanalWhatsApp(config.whatsapp);
    }
    console.warn('[canais] CANAL_ENVIO=whatsapp sem credenciais; usando envio simulado em log');
  }
  return new CanalLog();
}

export type { CanalEnvio, MensagemLembrete } from './canal-envio';
