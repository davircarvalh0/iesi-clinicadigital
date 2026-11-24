import type { CanalEnvio, MensagemLembrete, ResultadoEnvio } from './canal-envio';

export interface ConfigWhatsApp {
  token: string;
  phoneNumberId: string;
  template: string;
  idioma: string;
  versaoApi: string;
}

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Recife',
});

/** Adaptador da WhatsApp Business Cloud API (Graph API, mensagem do tipo template). */
export class CanalWhatsApp implements CanalEnvio {
  readonly nome = 'whatsapp';

  constructor(private readonly cfg: ConfigWhatsApp) {}

  async enviar(m: MensagemLembrete): Promise<ResultadoEnvio> {
    const url = `https://graph.facebook.com/${this.cfg.versaoApi}/${this.cfg.phoneNumberId}/messages`;
    const resposta = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: m.telefone,
        type: 'template',
        template: this.montarTemplate(m),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const corpo = (await resposta.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };
    if (!resposta.ok) {
      throw new Error(corpo.error?.message ?? `WhatsApp respondeu HTTP ${resposta.status}`);
    }
    return { idExterno: corpo.messages?.[0]?.id };
  }

  private montarTemplate(m: MensagemLembrete) {
    const template = { name: this.cfg.template, language: { code: this.cfg.idioma } };
    // O template de teste da Meta não aceita parâmetros.
    if (this.cfg.template === 'hello_world') return template;

    const texto = (text: string) => ({ type: 'text', text });
    return {
      ...template,
      components: [
        {
          type: 'body',
          parameters: [
            texto(m.pacienteNome),
            texto(m.especialidade),
            texto(fmtDataHora.format(m.inicioConsulta).replace(', ', ' às ')),
          ],
        },
      ],
    };
  }
}
