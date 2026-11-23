import { lerConfiguracaoLembretes } from './lembretes/configuracao';

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida`);
  return valor;
}

export const config = {
  porta: Number(process.env.PORTA ?? 3002),
  rabbitUrl: obrigatoria('RABBITMQ_URL'),
  ...lerConfiguracaoLembretes(process.env),
  consumidorMaxTentativas: Number(process.env.CONSUMIDOR_MAX_TENTATIVAS ?? 3),
  canalEnvio: process.env.CANAL_ENVIO === 'whatsapp' ? 'whatsapp' : 'log',
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    template: process.env.WHATSAPP_TEMPLATE ?? 'hello_world',
    idioma: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en_US',
    versaoApi: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
  },
} as const;
