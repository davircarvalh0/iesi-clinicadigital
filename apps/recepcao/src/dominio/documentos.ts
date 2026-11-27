export const soDigitos = (v: string) => v.replace(/\D/g, '');

export function mascararCpfDigitado(v: string): string {
  const n = soDigitos(v).slice(0, 11);
  return n
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export const cpfCompleto = (v: string) => soDigitos(v).length === 11;

/** CPF na tela: só os dígitos do meio aparecem (US-02, CA3). */
export function cpfProtegido(v: string): string {
  const n = soDigitos(v);
  if (n.length !== 11) return '•••';
  return `•••.${n.slice(3, 6)}.${n.slice(6, 9)}-••`;
}

export function mascararTelefoneDigitado(v: string): string {
  let n = soDigitos(v);
  if (n.startsWith('55') && n.length > 11) n = n.slice(2);
  n = n.slice(0, 11);
  if (n.length <= 2) return n.length ? `(${n}` : '';
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

export const telefone = (v: string) => mascararTelefoneDigitado(v) || '—';

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÁ-Ú]/.test(p));
  const primeira = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}
