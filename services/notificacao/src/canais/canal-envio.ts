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

export type ResultadoEnvio =
  | { status: 'simulado'; modoEnvio: 'simulado'; canalEnvio: 'log'; idExterno: null }
  | { status: 'aceito_provedor'; modoEnvio: 'real'; canalEnvio: 'whatsapp'; idExterno: string };

export class FalhaEnvio extends Error {}

/** Porta de saída para sistemas de terceiros. O modelo interno nunca conhece a API do provedor. */
export interface CanalEnvio {
  readonly nome: ResultadoEnvio['canalEnvio'];
  enviar(mensagem: MensagemLembrete): Promise<ResultadoEnvio>;
}
