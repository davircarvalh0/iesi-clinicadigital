const ANTECEDENCIA_NORMAL = 24 * 60;
const INTEIRO_32_MAXIMO = 2_147_483_647; // Limite do timer no Node e do campo Int no banco.

function inteiro(nome: string, valor: string | undefined, padrao: number, maximo: number): number {
  if (valor === undefined) return padrao;
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || !Number.isSafeInteger(numero) || numero < 1 || numero > maximo) {
    throw new Error(`${nome} inválido: use um inteiro de 1 a ${maximo}`);
  }
  return numero;
}

export function lerConfiguracaoLembretes(env: NodeJS.ProcessEnv) {
  const antecedenciaMinutos = inteiro(
    'LEMBRETE_ANTECEDENCIA_MINUTOS', env.LEMBRETE_ANTECEDENCIA_MINUTOS, ANTECEDENCIA_NORMAL, ANTECEDENCIA_NORMAL,
  );
  return {
    antecedenciaMinutos,
    modoAntecedencia: antecedenciaMinutos === ANTECEDENCIA_NORMAL ? 'normal' as const : 'demonstracao' as const,
    rotinaEnvioIntervaloMs: inteiro('ROTINA_ENVIO_INTERVALO_MS', env.ROTINA_ENVIO_INTERVALO_MS, 5000, INTEIRO_32_MAXIMO),
    envioMaxTentativas: inteiro('ENVIO_MAX_TENTATIVAS', env.ENVIO_MAX_TENTATIVAS, 3, INTEIRO_32_MAXIMO),
  };
}
