const FUSO = 'America/Recife';
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });
const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: FUSO });
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO });
const fmtChaveDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO });
const fmtHoraDoDia = new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: FUSO });

const DIA_MS = 24 * 60 * 60 * 1000;

export const hora = (iso: string) => fmtHora.format(new Date(iso));
export const diaPorExtenso = (data: Date) => fmtDia.format(data);
/** AAAA-MM-DD no fuso de Recife, para agrupar consultas por dia. */
export const chaveDia = (data: Date) => fmtChaveDia.format(data);
export const chaveDiaDaqui = (dias: number) => chaveDia(new Date(Date.now() + dias * DIA_MS));
/** Ex.: "23/10 às 10:00". */
export const dataHora = (iso: string) => `${fmtDiaMes.format(new Date(iso))} às ${hora(iso)}`;

export function saudacao(data = new Date()): string {
  const h = Number(fmtHoraDoDia.format(data));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/** "Hoje · quinta-feira, 22 de outubro", "Amanhã · ...", ou só o dia por extenso. */
export function rotuloDia(iso: string): string {
  const data = new Date(iso);
  const chave = chaveDia(data);
  const extenso = diaPorExtenso(data);
  if (chave === chaveDiaDaqui(0)) return `Hoje · ${extenso}`;
  if (chave === chaveDiaDaqui(1)) return `Amanhã · ${extenso}`;
  return extenso;
}

export function tempoRelativo(iso: string, agora: number): string {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'agora';
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  return hora(iso);
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

const soDigitos = (v: string) => v.replace(/\D/g, '');

export function mascaraCpf(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export function mascaraTelefone(v: string): string {
  const d = soDigitos(v).replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Junta data (AAAA-MM-DD) e hora (HH:MM) de inputs em ISO 8601 com o fuso de Recife. */
export const isoRecife = (data: string, hora: string) => `${data}T${hora}:00-03:00`;
