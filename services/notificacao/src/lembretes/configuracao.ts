const ANTECEDENCIA_NORMAL = 24 * 60;
const INTERVALO_MAXIMO_MS = 2_147_483_647; // Limite de setInterval no Node.

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
    rotinaEnvioIntervaloMs: inteiro('ROTINA_ENVIO_INTERVALO_MS', env.ROTINA_ENVIO_INTERVALO_MS, 5000, INTERVALO_MAXIMO_MS),
    envioMaxTentativas: inteiro('ENVIO_MAX_TENTATIVAS', env.ENVIO_MAX_TENTATIVAS, 3, Number.MAX_SAFE_INTEGER),
  };
}
