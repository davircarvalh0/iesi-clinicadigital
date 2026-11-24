import { z } from 'zod';

const cpfNormalizado = z.string().trim().regex(/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/)
  .transform((cpf) => cpf.replace(/\D/g, ''));

export const esquemaBuscaCpf = z.object({ cpf: cpfNormalizado }).strict();

export const esquemaBusca = z.object({
  busca: z.string().trim().max(120).default(''),
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  tamanhoPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export const esquemaContato = z.object({
  telefone: z.string().transform((v) => v.replace(/\D/g, ''))
    .refine((v) => /^(?:55)?[1-9]\d{9,10}$/.test(v), 'Informe DDD e telefone válidos').optional(),
  email: z.union([z.string().trim().pipe(z.email().max(254)), z.literal(''), z.null()])
    .transform((v) => v || null).optional(),
  nascimento: z.iso.date()
    .refine((v) => v <= new Date().toISOString().slice(0, 10))
    .transform((v) => new Date(`${v}T00:00:00.000Z`)).nullable().optional(),
  convenio: z.string().trim().max(120).nullable().transform((v) => v || null).optional(),
  // Permite conferir o CPF, sem escrever nele.
  cpf: cpfNormalizado.optional(),
  revisao: z.number().int().positive(),
}).strict().refine(({ revisao: _revisao, ...campos }) => Object.values(campos).some((v) => v !== undefined));

export const esquemaPacienteAgendado = z.object({
  id_evento: z.string().min(1),
  tipo: z.literal('consulta.agendada'),
  versao: z.literal(1),
  origem: z.literal('agendamento'),
  id_correlacao: z.string().min(1),
  ocorrido_em: z.iso.datetime({ offset: true }),
  payload: z.object({
    id_consulta: z.string().min(1),
    paciente: z.object({
      cpf: cpfNormalizado,
      nome: z.string().trim().min(3),
      telefone: z.string().regex(/^\d{10,13}$/),
    }),
  }),
});
