// US-26: horários da agenda no fuso da clínica. Recife não tem horário de verão, então o
// deslocamento é fixo (-03:00), o mesmo usado nos dados de demonstração.
export const FUSO_CLINICA = 'America/Recife';
const DESLOCAMENTO = '-03:00';

export interface Intervalo { diaSemana: number; inicioMinutos: number; fimMinutos: number }
export interface Ocupacao { inicio: Date; duracaoMinutos: number }

const formatoData = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit' });
const formatoHora = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO_CLINICA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatoDia = new Intl.DateTimeFormat('en-US', { timeZone: FUSO_CLINICA, weekday: 'short' });

/** Data (AAAA-MM-DD), dia da semana (0 = domingo) e minutos desde 00:00 no fuso da clínica. */
export function noFusoDaClinica(instante: Date) {
  const [h, m] = formatoHora.format(instante).split(':').map(Number);
  return { data: formatoData.format(instante), diaSemana: DIAS.indexOf(formatoDia.format(instante)), minutos: h * 60 + m };
}

/** Instante correspondente a uma data local da clínica e minutos desde 00:00. */
export function instanteNaClinica(data: string, minutos: number): Date {
  const hh = String(Math.floor(minutos / 60)).padStart(2, '0'), mm = String(minutos % 60).padStart(2, '0');
  return new Date(`${data}T${hh}:${mm}:00${DESLOCAMENTO}`);
}

export const paraHHMM = (minutos: number) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
export function deHHMM(valor: string): number {
  const [h, m] = valor.split(':').map(Number);
  return h * 60 + m;
}

/** Dia seguinte (AAAA-MM-DD), sem depender do fuso do servidor. */
export function proximoDia(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** A consulta [inicio, inicio + duracao) cabe inteira em algum intervalo do dia? */
export function cabeNaDisponibilidade(inicio: Date, duracaoMinutos: number, intervalos: Intervalo[]): boolean {
  const { diaSemana, minutos } = noFusoDaClinica(inicio);
  return intervalos.some((i) => i.diaSemana === diaSemana && i.inicioMinutos <= minutos && minutos + duracaoMinutos <= i.fimMinutos);
}

export const sobrepoe = (a: Ocupacao, b: Ocupacao) =>
  a.inicio.getTime() < b.inicio.getTime() + b.duracaoMinutos * 60_000
  && b.inicio.getTime() < a.inicio.getTime() + a.duracaoMinutos * 60_000;

/** Horários livres de um dia: grade de `duracao` minutos dentro dos intervalos, sem conflito e no futuro. */
export function horariosLivres(data: string, duracaoMinutos: number, intervalos: Intervalo[], ocupadas: Ocupacao[], agora = new Date()): Date[] {
  const diaSemana = noFusoDaClinica(instanteNaClinica(data, 12 * 60)).diaSemana;
  const livres: Date[] = [];
  for (const i of intervalos.filter((x) => x.diaSemana === diaSemana).sort((a, b) => a.inicioMinutos - b.inicioMinutos)) {
    for (let m = i.inicioMinutos; m + duracaoMinutos <= i.fimMinutos; m += duracaoMinutos) {
      const candidato = { inicio: instanteNaClinica(data, m), duracaoMinutos };
      if (candidato.inicio > agora && !ocupadas.some((o) => sobrepoe(o, candidato))) livres.push(candidato.inicio);
    }
  }
  return livres;
}

/** Intervalos de um mesmo dia não podem se sobrepor. */
export function intervalosSobrepostos(intervalos: Intervalo[]): boolean {
  const ordenados = [...intervalos].sort((a, b) => a.diaSemana - b.diaSemana || a.inicioMinutos - b.inicioMinutos);
  return ordenados.some((i, n) => n > 0 && ordenados[n - 1].diaSemana === i.diaSemana && ordenados[n - 1].fimMinutos > i.inicioMinutos);
}
