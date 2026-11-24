import { config } from '../config';
import type { CanalEnvio } from './canal-envio';
import { CanalLog } from './canal-log';
import { CanalWhatsApp } from './canal-whatsapp';
import { descreverEnvio } from './configuracao-envio';

export function criarCanalEnvio({ canalEnvio, whatsapp }: Pick<typeof config, 'canalEnvio' | 'whatsapp'> = config): CanalEnvio {
  const descricao = descreverEnvio({ canalEnvio, whatsapp });
  console.log(`[canais] modo de envio ${descricao.modo}: ${descricao.motivo}`);
  return descricao.modo === 'real' ? new CanalWhatsApp(whatsapp) : new CanalLog();
}

export type { CanalEnvio, MensagemLembrete } from './canal-envio';
