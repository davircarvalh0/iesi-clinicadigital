import { EnvioIncerto, FalhaEnvio, type CanalEnvio, type MensagemLembrete, type ResultadoEnvio } from './canal-envio';
import { destinoPermitido, type DestinosPermitidos } from './configuracao-envio';
import { TIMEOUT_WHATSAPP_MS } from '../lembretes/configuracao';

export interface ConfigWhatsApp {
  token: string;
  phoneNumberId: string;
  template: string;
  idioma: string;
  versaoApi: string;
  /** US-15: destinos de teste do envio real; `todos` só com configuração explícita. */
  destinosPermitidos: DestinosPermitidos;
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
    // US-15: no protótipo os dados são fictícios; só destinos de teste recebem mensagem real.
    if (!destinoPermitido(this.cfg.destinosPermitidos, m.telefone)) {
      throw new FalhaEnvio('Destino fora da lista de teste (WHATSAPP_DESTINOS_PERMITIDOS): nenhuma mensagem enviada', true);
    }

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
      signal: AbortSignal.timeout(TIMEOUT_WHATSAPP_MS),
    }).catch((erro: unknown) => {
      throw classificarErroDeRede(erro);
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

/**
 * Códigos em que a conexão nem chegou a ser aberta: o pedido não saiu e repetir é seguro.
 * Qualquer outro erro depois de iniciado o pedido (tempo esgotado, conexão cortada) é incerto.
 */
const SEM_PEDIDO_ENVIADO = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/** US-15: separa "nada saiu" (falha, pode repetir) de "pode ter saído" (incerto, não repete sozinho). */
export function classificarErroDeRede(erro: unknown): FalhaEnvio | EnvioIncerto {
  if (erro instanceof Error && (erro.name === 'TimeoutError' || erro.name === 'AbortError')) {
    return new EnvioIncerto('Sem resposta do WhatsApp no tempo limite: a mensagem pode ter sido enviada');
  }
  const causa = (erro as { cause?: { code?: unknown } } | null)?.cause;
  const codigo = typeof causa?.code === 'string' ? causa.code : (erro as { code?: unknown } | null)?.code;
  if (typeof codigo === 'string' && SEM_PEDIDO_ENVIADO.has(codigo)) {
    return new FalhaEnvio('Não foi possível conectar ao WhatsApp');
  }
  return new EnvioIncerto('Conexão com o WhatsApp interrompida sem resposta: a mensagem pode ter sido enviada');
}
