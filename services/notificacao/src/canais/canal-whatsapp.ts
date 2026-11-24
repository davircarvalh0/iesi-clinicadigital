import { FalhaEnvio, type CanalEnvio, type MensagemLembrete, type ResultadoEnvio } from './canal-envio';

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
  readonly canalContato = 'whatsapp' as const;

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
    }).catch((erro: unknown) => {
      if (erro instanceof Error && erro.name === 'TimeoutError') {
        throw new FalhaEnvio('Tempo limite ao contatar o WhatsApp');
      }
      throw new FalhaEnvio('Falha de comunicação com o WhatsApp');
    });

    if (!resposta.ok) {
      throw new FalhaEnvio(`WhatsApp respondeu HTTP ${resposta.status}`);
    }

    const corpo = (await resposta.json().catch(() => ({}))) as {
      messages?: { id?: unknown }[];
    } | null;
    const idExterno = corpo?.messages?.[0]?.id;
    if (typeof idExterno !== 'string' || !idExterno.trim()) {
      throw new FalhaEnvio('WhatsApp respondeu sem identificador da mensagem');
    }
    return { status: 'aceito_provedor', modoEnvio: 'real', canalEnvio: 'whatsapp', idExterno };
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
