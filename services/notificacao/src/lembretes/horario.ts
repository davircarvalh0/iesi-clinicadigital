export const MOTIVO_CONSULTA_INICIADA = 'A consulta já começou';

export function calcularEnvio(inicioConsulta: Date, agora: Date, antecedenciaMinutos: number) {
  const inicio = inicioConsulta.getTime();
  const agoraMs = agora.getTime();
  const previsto = inicio - antecedenciaMinutos * 60_000;
  const expirado = inicio <= agoraMs;
  return { expirado, enviarEm: new Date(expirado ? previsto : Math.max(previsto, agoraMs)) };
}
