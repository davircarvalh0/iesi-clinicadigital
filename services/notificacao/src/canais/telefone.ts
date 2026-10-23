/** Converte para o formato internacional só com dígitos, assumindo Brasil (55) quando falta o código do país. */
export function paraFormatoInternacional(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '');
  return digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`;
}
