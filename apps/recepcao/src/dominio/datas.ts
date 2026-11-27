// A clínica fica em Recife (UTC−3, sem horário de verão). Toda data mostrada ou digitada usa esse fuso,
// independentemente do fuso do computador da recepção.
export const FUSO = 'America/Recife';
const OFFSET = '-03:00';
const DIA_MS = 86_400_000;

const fmt = (opcoes: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, ...opcoes });
const fHora = fmt({ hour: '2-digit', minute: '2-digit' });
const fHoraSeg = fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fDataCurta = fmt({ day: '2-digit', month: '2-digit' });
const fDataHora = fmt({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fDiaSemana = fmt({ weekday: 'short' });
const fDiaLongo = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fChave = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

type Data = string | number | Date;
const d = (v: Data) => (v instanceof Date ? v : new Date(v));

export const hora = (v: Data) => fHora.format(d(v));
export const horaSeg = (v: Data) => fHoraSeg.format(d(v));
export const dataCurta = (v: Data) => fDataCurta.format(d(v));
export const dataHora = (v: Data) => fDataHora.format(d(v)).replace(',', ' às');

/** Dia civil em Recife no formato AAAA-MM-DD (ordena como texto). */
export const chaveDia = (v: Data) => fChave.format(d(v));

/** Dia civil em Recife `n` dias depois de `base` (padrão: hoje). */
export function somarDias(chave: string, n: number): string {
  return chaveDia(new Date(`${chave}T12:00:00${OFFSET}`).getTime() + n * DIA_MS);
}

export const hoje = () => chaveDia(Date.now());

/** Momento ISO com o fuso de Recife, a partir de data (AAAA-MM-DD) e hora (HH:MM) digitadas. */
export const momentoRecife = (dia: string, horario: string) => `${dia}T${horario}:00${OFFSET}`;

export const dataDaChave = (chave: string) => new Date(`${chave}T12:00:00${OFFSET}`);

export function nomeDoDia(chave: string): string {
  const h = hoje();
  if (chave === h) return 'Hoje';
  if (chave === somarDias(h, 1)) return 'Amanhã';
  if (chave === somarDias(h, -1)) return 'Ontem';
  const texto = fDiaLongo.format(dataDaChave(chave));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export const diaDaSemanaCurto = (chave: string) => fDiaSemana.format(dataDaChave(chave)).replace('.', '');
export const diaDoMes = (chave: string) => chave.slice(8, 10).replace(/^0/, '');

export const diaPorExtenso = (v: Data = Date.now()) => {
  const texto = fDiaLongo.format(d(v));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/** Segunda-feira da semana de `chave`. */
export function inicioDaSemana(chave: string): string {
  const diaSemana = dataDaChave(chave).getUTCDay(); // meio-dia em Recife = 15h UTC, mesmo dia
  return somarDias(chave, diaSemana === 0 ? -6 : 1 - diaSemana);
}

/** "há 12 s", "há 3 min", "às 14:02" para eventos mais antigos. */
export function relativo(v: Data, agora = Date.now()): string {
  const seg = Math.max(0, Math.round((agora - d(v).getTime()) / 1000));
  if (seg < 60) return `há ${seg} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `há ${min} min`;
  return chaveDia(v) === chaveDia(agora) ? `às ${hora(v)}` : dataHora(v);
}

export function saudacao(agora = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: 'numeric', hourCycle: 'h23' }).format(agora));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
