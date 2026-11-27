// US-15: configuração explícita do envio. Decide o modo (real ou simulado), por quê, e para quais
// destinos o envio real é permitido. Funções puras, testadas em test/us15.test.ts.
import { paraFormatoInternacional } from './telefone';
import type { ConfigEmail } from './canal-email';

/** `todos` só com WHATSAPP_DESTINOS_PERMITIDOS=*; vazio bloqueia todo envio real. */
export type DestinosPermitidos = ReadonlySet<string> | 'todos';

export function lerDestinosPermitidos(valor: string | undefined): DestinosPermitidos {
  const texto = (valor ?? '').trim();
  if (texto === '*') return 'todos';
  const destinos = texto.split(/[,;\n]+/).map((d) => d.replace(/\D/g, '')).filter(Boolean);
  for (const d of destinos) {
    if (d.length < 10 || d.length > 13) throw new Error('WHATSAPP_DESTINOS_PERMITIDOS inválido: use telefones com DDD, separados por vírgula, ou *');
  }
  return new Set(destinos.map(paraFormatoInternacional));
}

export function destinoPermitido(destinos: DestinosPermitidos, telefoneInternacional: string): boolean {
  return destinos === 'todos' || destinos.has(paraFormatoInternacional(telefoneInternacional));
}

export interface EntradaConfiguracaoEnvio {
  canalEnvio: 'log' | 'whatsapp' | 'email';
  email?: ConfigEmail;
  whatsapp: { token: string; phoneNumberId: string; destinosPermitidos: DestinosPermitidos };
}

export interface DescricaoEnvio {
  modo: 'real' | 'simulado';
  canal: 'log' | 'whatsapp' | 'email';
  canalContato?: 'email';
  /** Por que o modo é este, em linguagem da recepção. */
  motivo: string;
  /** Quantidade de destinos de teste, `todos`, ou null no modo simulado. Nunca expõe os números. */
  destinosPermitidos: number | 'todos' | null;
}

export function descreverEnvio({ canalEnvio, whatsapp, email }: EntradaConfiguracaoEnvio): DescricaoEnvio {
  if (canalEnvio === 'email') {
    if (!email?.token.trim() || !email.remetente.trim()) {
      return { modo: 'simulado', canal: 'email', canalContato: 'email', motivo: 'E-mail sem credenciais: envio simulado em log.', destinosPermitidos: null };
    }
    const destinos = email.destinosPermitidos === 'todos' ? 'todos' : email.destinosPermitidos.size;
    return { modo: 'real', canal: 'email', canalContato: 'email', motivo: 'Envio por e-mail via Resend, restrito aos destinos configurados.', destinosPermitidos: destinos };
  }
  if (canalEnvio === 'log') {
    return { modo: 'simulado', canal: 'log', motivo: 'CANAL_ENVIO=log: nenhuma mensagem sai da clínica.', destinosPermitidos: null };
  }
  if (!whatsapp.token.trim() || !whatsapp.phoneNumberId.trim()) {
    return { modo: 'simulado', canal: 'log', motivo: 'CANAL_ENVIO=whatsapp sem credenciais: envio simulado em log.', destinosPermitidos: null };
  }
  const destinos = whatsapp.destinosPermitidos;
  if (destinos === 'todos') {
    return { modo: 'real', canal: 'whatsapp', motivo: 'Envio real pelo WhatsApp para qualquer destino (WHATSAPP_DESTINOS_PERMITIDOS=*).', destinosPermitidos: 'todos' };
  }
  return {
    modo: 'real', canal: 'whatsapp',
    motivo: destinos.size
      ? `Envio real pelo WhatsApp somente para ${destinos.size} destino(s) de teste.`
      : 'Envio real pelo WhatsApp sem destino de teste configurado: nenhuma mensagem será enviada.',
    destinosPermitidos: destinos.size,
  };
}
