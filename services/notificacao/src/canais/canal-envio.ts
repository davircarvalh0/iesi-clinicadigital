import type { CanalContato } from '@clinica/eventos';

/** Dados mínimos de que um canal precisa para enviar o lembrete. */
export interface MensagemLembrete {
  /** Telefone no formato internacional, só dígitos (ex.: 5581999999999). */
  telefone: string;
  email?: string | null;
  pacienteNome: string;
  especialidade: string;
  profissional: string;
  inicioConsulta: Date;
}

export type ResultadoEnvio =
  | { status: 'simulado'; modoEnvio: 'simulado'; canalEnvio: 'log' | 'email'; idExterno: null }
  | { status: 'aceito_provedor'; modoEnvio: 'real'; canalEnvio: 'whatsapp' | 'email'; idExterno: string };

/** O provedor recusou ou não foi alcançado: nenhuma mensagem saiu. */
export class FalhaEnvio extends Error {
  /** Definitiva: repetir não muda o resultado (ex.: destino fora da lista de teste, US-15). */
  constructor(mensagem: string, readonly definitiva = false) {
    super(mensagem);
  }
}

/**
 * US-15: o pedido pode ter chegado ao provedor, mas não houve resposta (tempo esgotado, conexão
 * cortada). Repetir sozinho pode duplicar a mensagem; a recepção decide.
 */
export class EnvioIncerto extends Error {}

/** Porta de saída para sistemas de terceiros. O modelo interno nunca conhece a API do provedor. */
export interface CanalEnvio {
  readonly nome: ResultadoEnvio['canalEnvio'];
  readonly simulado?: boolean;
  /** Canal cuja autorização do paciente é exigida antes do envio (US-14), no envio real e no simulado. */
  readonly canalContato: CanalContato;
  enviar(mensagem: MensagemLembrete): Promise<ResultadoEnvio>;
}
