import type { CanalContato } from '@clinica/eventos';

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
  /** Canal cuja autorização do paciente é exigida antes do envio (US-14). */
  readonly canalContato: CanalContato;
  enviar(mensagem: MensagemLembrete): Promise<ResultadoEnvio>;
}
