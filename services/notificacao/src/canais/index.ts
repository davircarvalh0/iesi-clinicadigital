import { config } from '../config';
import type { CanalEnvio } from './canal-envio';
import { CanalLog } from './canal-log';
import { CanalWhatsApp } from './canal-whatsapp';
import { CanalEmail } from './canal-email';
import { descreverEnvio } from './configuracao-envio';

export function criarCanalEnvio({ canalEnvio, whatsapp, email }: Pick<typeof config, 'canalEnvio' | 'whatsapp'> & Partial<Pick<typeof config, 'email'>> = config): CanalEnvio {
  const descricao = descreverEnvio({ canalEnvio, whatsapp, email });
  console.log(`[canais] modo de envio ${descricao.modo}: ${descricao.motivo}`);
  if (descricao.modo === 'simulado') return new CanalLog(canalEnvio === 'email' ? 'email' : 'whatsapp');
  return canalEnvio === 'email' ? new CanalEmail(email!) : new CanalWhatsApp(whatsapp);
}

export type { CanalEnvio, MensagemLembrete } from './canal-envio';
