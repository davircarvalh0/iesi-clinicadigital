import { Router } from 'express';
import { z } from 'zod';
import { FUSO_CLINICA, instanteNaClinica, noFusoDaClinica, proximoDia } from '../agenda/horario';
import { prisma } from '../db';
import { permitir } from '../http/acesso';
import { ErroHttp } from '../http/erros';

export const rotasIndicadores = Router();
rotasIndicadores.use(permitir('administrador'));

const SITUACOES = ['agendada', 'confirmada', 'concluida', 'cancelada', 'falta'] as const;
type Situacao = (typeof SITUACOES)[number];
type Contagem = Record<Situacao, number> & { total: number };
const vazia = (): Contagem => ({ agendada: 0, confirmada: 0, concluida: 0, cancelada: 0, falta: 0, total: 0 });

/** Período em dias da clínica (America/Recife), pelo início da consulta. Padrão: o mês corrente. */
const esquemaPeriodo = z.object({
  de: z.iso.date('Data inicial inválida. Use AAAA-MM-DD.').optional(),
  ate: z.iso.date('Data final inválida. Use AAAA-MM-DD.').optional(),
});
function periodo(query: unknown) {
  const entrada = esquemaPeriodo.parse(query);
  const hoje = noFusoDaClinica(new Date()).data;
  const de = entrada.de ?? `${hoje.slice(0, 8)}01`;
  let ate = entrada.ate;
  if (!ate) {
    // Último dia do mês de `de`.
    const [a, m] = de.split('-').map(Number);
    ate = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  }
  if (de > ate) throw new ErroHttp(400, 'Dados inválidos. A data inicial deve ser anterior ou igual à final.');
  if ((Date.parse(ate) - Date.parse(de)) / 86_400_000 > 366) throw new ErroHttp(400, 'Dados inválidos. Período máximo de 366 dias.');
  return { de, ate, inicio: instanteNaClinica(de, 0), fim: instanteNaClinica(proximoDia(ate), 0) };
}

const taxa = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 1000) / 10 : null);

/**
 * US-29: GET /indicadores/resumo?de=&ate=
 * `pacientesCadastrados` conta CPFs distintos de todas as consultas: no protótipo, todo paciente do
 * cadastro mestre nasce de uma consulta (US-01), então o número coincide sem consultar o Cadastro.
 */
rotasIndicadores.get('/resumo', async (req, res) => {
  const p = periodo(req.query);
  const [porSituacao, [pacientes], [novos]] = await Promise.all([
    prisma.consulta.groupBy({ by: ['status'], where: { inicio: { gte: p.inicio, lt: p.fim } }, _count: { _all: true } }),
    prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(DISTINCT paciente_cpf) AS total FROM consultas`,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total FROM (SELECT paciente_cpf FROM consultas GROUP BY paciente_cpf HAVING MIN(criado_em) >= ${p.inicio} AND MIN(criado_em) < ${p.fim}) novos`,
  ]);
  const consultas = vazia();
  for (const linha of porSituacao) { consultas[linha.status] = linha._count._all; consultas.total += linha._count._all; }
  const encerradas = consultas.concluida + consultas.falta;
  res.json({
    periodo: { de: p.de, ate: p.ate, fuso: FUSO_CLINICA },
    pacientesCadastrados: Number(pacientes.total),
    pacientesNovosNoPeriodo: Number(novos.total),
    consultas: {
      total: consultas.total,
      agendadas: consultas.agendada, confirmadas: consultas.confirmada, concluidas: consultas.concluida,
      canceladas: consultas.cancelada, faltas: consultas.falta,
      aRealizar: consultas.agendada + consultas.confirmada,
    },
    /** Percentuais com uma casa decimal; null quando não há base. */
    taxas: {
      comparecimento: taxa(consultas.concluida, encerradas),
      falta: taxa(consultas.falta, encerradas),
      cancelamento: taxa(consultas.cancelada, consultas.total),
    },
  });
});

/** US-29: GET /indicadores/consultas?de=&ate= — contagem por dia e por profissional, pelo início da consulta. */
rotasIndicadores.get('/consultas', async (req, res) => {
  const p = periodo(req.query);
  const linhas = await prisma.$queryRaw<{ dia: string; profissional_id: string; profissional: string; status: Situacao; total: bigint }[]>`
    SELECT to_char(c.inicio AT TIME ZONE ${FUSO_CLINICA}, 'YYYY-MM-DD') AS dia, c.profissional_id, p.nome AS profissional,
           c.status::text AS status, COUNT(*) AS total
    FROM consultas c JOIN profissionais p ON p.id = c.profissional_id
    WHERE c.inicio >= ${p.inicio} AND c.inicio < ${p.fim}
    GROUP BY 1, 2, 3, 4`;
  const porDia = new Map<string, Contagem>(), porProfissional = new Map<string, Contagem & { profissionalId: string; profissional: string }>();
  for (let d = p.de; d <= p.ate; d = proximoDia(d)) porDia.set(d, vazia());
  for (const l of linhas) {
    const n = Number(l.total);
    const dia = porDia.get(l.dia)!;
    dia[l.status] += n; dia.total += n;
    const prof = porProfissional.get(l.profissional_id) ?? { profissionalId: l.profissional_id, profissional: l.profissional, ...vazia() };
    prof[l.status] += n; prof.total += n;
    porProfissional.set(l.profissional_id, prof);
  }
  res.json({
    periodo: { de: p.de, ate: p.ate, fuso: FUSO_CLINICA },
    porDia: [...porDia].map(([data, c]) => ({ data, ...c })),
    porProfissional: [...porProfissional.values()].sort((a, b) => b.total - a.total || a.profissional.localeCompare(b.profissional)),
  });
});
