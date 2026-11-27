import { z } from 'zod';
import { horariosLivres, instanteNaClinica, proximoDia } from '../agenda/horario';
import { prisma } from '../db';
import { ErroHttp } from '../http/erros';
import { SITUACOES_ATIVAS } from './servico';

export const esquemaHorarios = z.object({
  profissionalId: z.uuid('Identificador do profissional inválido.'),
  data: z.iso.date('Data inválida. Use AAAA-MM-DD.'),
  dias: z.coerce.number().int().min(1).max(14, 'No máximo 14 dias por consulta.').default(1),
});

/** US-26: horários livres na grade semanal do profissional, a partir de `data`, por `dias` dias. */
export async function horariosDisponiveis({ profissionalId, data, dias }: z.infer<typeof esquemaHorarios>) {
  const profissional = await prisma.profissional.findUnique({ where: { id: profissionalId }, include: { disponibilidades: true } });
  if (!profissional) throw new ErroHttp(404, 'Profissional não encontrado.');
  const datas = [data];
  while (datas.length < dias) datas.push(proximoDia(datas.at(-1)!));
  const base = { profissionalId, profissional: profissional.nome, especialidade: profissional.especialidade, duracaoConsultaMinutos: profissional.duracaoConsultaMinutos };
  if (!profissional.ativo) return { ...base, horarios: [] };

  const inicioJanela = instanteNaClinica(data, 0), fimJanela = instanteNaClinica(proximoDia(datas.at(-1)!), 0);
  const ocupadas = await prisma.consulta.findMany({
    where: {
      profissionalId, status: { in: [...SITUACOES_ATIVAS] },
      // Uma consulta iniciada até 4 h antes da janela (duração máxima) ainda pode ocupá-la.
      inicio: { gte: new Date(inicioJanela.getTime() - 240 * 60_000), lt: fimJanela },
    },
    select: { inicio: true, duracaoMinutos: true },
  });
  const horarios = datas.flatMap((d) => horariosLivres(d, profissional.duracaoConsultaMinutos, profissional.disponibilidades, ocupadas));
  return { ...base, horarios: horarios.map((h) => h.toISOString()) };
}
