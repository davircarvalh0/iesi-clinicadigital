function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida`);
  return valor;
}

export const config = {
  porta: Number(process.env.PORTA ?? 3001),
  rabbitUrl: obrigatoria('RABBITMQ_URL'),
  outboxIntervaloMs: Number(process.env.OUTBOX_INTERVALO_MS ?? 1000),
};

export const ORIGEM = 'agendamento';
