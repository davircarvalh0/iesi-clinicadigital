/** Dados mínimos de que um canal precisa para enviar o lembrete. */
export interface MensagemLembrete {
  /** Telefone no formato internacional, só dígitos (ex.: 5581999999999). */
  telefone: string;
  pacienteNome: string;
  especialidade: string;
  profissional: string;
  inicioConsulta: Date;
}

export interface ResultadoEnvio {
  idExterno?: string;
}

/** Porta de saída para sistemas de terceiros. O modelo interno nunca conhece a API do provedor. */
export interface CanalEnvio {
  readonly nome: string;
  enviar(mensagem: MensagemLembrete): Promise<ResultadoEnvio>;
}
