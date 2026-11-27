import { EnvioIncerto, FalhaEnvio, type CanalEnvio, type MensagemLembrete, type ResultadoEnvio } from './canal-envio';

export interface ConfigEmail {
  token: string;
  remetente: string;
  destinosPermitidos: ReadonlySet<string> | 'todos';
}

export function lerDestinosEmail(valor: string | undefined): ConfigEmail['destinosPermitidos'] {
  if (valor?.trim() === '*') return 'todos';
  return new Set((valor ?? '').split(/[,;\n]/).map(v => v.trim().toLowerCase()).filter(Boolean));
}

export function destinatarioEmail(email: string | null | undefined): string {
  const destino = email?.trim();
  if (!destino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) {
    throw new FalhaEnvio('Paciente sem e-mail válido no cadastro', true);
  }
  return destino;
}

const formato = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Recife',
});

export function montarMensagem(m: MensagemLembrete) {
  return {
    subject: 'Lembrete de consulta - Clínica Digital',
    text: `Olá, ${m.pacienteNome}!\n\nVocê tem uma consulta com ${m.profissional} em ${formato.format(m.inicioConsulta)}.\n\nCaso precise alterar o agendamento, entre em contato com a recepção.\n\nClínica Digital`,
  };
}

export class CanalEmail implements CanalEnvio {
  readonly nome = 'email' as const;
  readonly canalContato = 'email' as const;

  constructor(private readonly cfg: ConfigEmail, private readonly requisitar: typeof fetch = fetch) {}

  async enviar(m: MensagemLembrete): Promise<ResultadoEnvio> {
    const email = destinatarioEmail(m.email);
    if (this.cfg.destinosPermitidos !== 'todos' && !this.cfg.destinosPermitidos.has(email.toLowerCase())) {
      throw new FalhaEnvio('E-mail fora da lista de destinos permitidos', true);
    }
    let resposta: Response;
    try {
      resposta = await this.requisitar('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.cfg.remetente, to: [email], ...montarMensagem(m) }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new EnvioIncerto('Sem resposta do provedor de e-mail: a mensagem pode ter sido enviada');
    }
    if (resposta.status >= 500) throw new EnvioIncerto('Provedor de e-mail indisponível: resultado do envio desconhecido');
    if (!resposta.ok) throw new FalhaEnvio(`Provedor de e-mail respondeu HTTP ${resposta.status}`, resposta.status !== 429);
    const corpo: unknown = await resposta.json().catch(() => null);
    const id = (corpo as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || !id.trim()) throw new EnvioIncerto('Provedor de e-mail respondeu sem identificador');
    return { status: 'aceito_provedor', modoEnvio: 'real', canalEnvio: 'email', idExterno: id };
  }
}
