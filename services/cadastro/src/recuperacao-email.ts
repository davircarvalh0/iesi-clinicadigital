/** Envio transacional de recuperação. Nenhum código ou endereço é registrado em produção. */
export function recuperacaoConfigurada() {
  return process.env.TEST_CONTROLS === 'true' || Boolean(process.env.RESEND_API_KEY && process.env.RECUPERACAO_REMETENTE);
}

export async function entregarCodigo(codigo: string, email: string): Promise<void> {
  if (process.env.TEST_CONTROLS === 'true') {
    console.log(`[cadastro] recuperação de senha (envio simulado; destinatário omitido): código ${codigo}, válido por 30 min`);
    return;
  }
  const token = process.env.RESEND_API_KEY, remetente = process.env.RECUPERACAO_REMETENTE;
  if (!token || !remetente) throw new Error('Canal de recuperação indisponível');
  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: remetente, to: [email], subject: 'Recuperação de senha — Vida & Saúde',
      text: `Seu código de recuperação é ${codigo}. Ele vence em 30 minutos. Se você não solicitou, ignore esta mensagem.` }),
    signal: AbortSignal.timeout(8000),
  });
  if (!resposta.ok) throw new Error('Entrega de recuperação recusada');
}
