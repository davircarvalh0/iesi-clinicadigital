import { lerDestinosPermitidos } from './canais/configuracao-envio';
import { lerDestinosEmail } from './canais/canal-email';
import { lerConfiguracaoLembretes } from './lembretes/configuracao';

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida`);
  return valor;
}

/** Canal cuja autorização é exigida, inclusive durante a simulação. */
export const CANAL_LEMBRETE = ['email', 'email_log'].includes(process.env.CANAL_ENVIO ?? '') ? 'email' as const : 'whatsapp' as const;

export const config = {
  porta: Number(process.env.PORTA ?? 3002),
  rabbitUrl: obrigatoria('RABBITMQ_URL'),
  ...lerConfiguracaoLembretes(process.env),
  consumidorMaxTentativas: Number(process.env.CONSUMIDOR_MAX_TENTATIVAS ?? 3),
  envioAutomaticoHabilitado: process.env.ENVIO_AUTOMATICO_HABILITADO !== 'false',
  canalEnvio: process.env.CANAL_ENVIO === 'email_log' ? 'email_log' : process.env.CANAL_ENVIO === 'email' ? 'email' : process.env.CANAL_ENVIO === 'whatsapp' ? 'whatsapp' : 'log',
  email: {
    token: process.env.RESEND_API_KEY ?? '',
    remetente: process.env.LEMBRETE_EMAIL_REMETENTE ?? '',
    destinosPermitidos: lerDestinosEmail(process.env.LEMBRETE_EMAIL_DESTINOS_PERMITIDOS),
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    template: process.env.WHATSAPP_TEMPLATE ?? 'hello_world',
    idioma: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en_US',
    versaoApi: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
    destinosPermitidos: lerDestinosPermitidos(process.env.WHATSAPP_DESTINOS_PERMITIDOS),
  },
  /** Rotas /operacao (inspeção e reprocessamento da fila de erros): só no ambiente de demonstração. */
  operacaoHabilitada: process.env.OPERACAO_HABILITADA === 'true',
} as const;
