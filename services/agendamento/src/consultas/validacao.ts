import { z } from 'zod';

const soDigitos = (v: string) => v.replace(/\D/g, '');

export const esquemaNovaConsulta = z.object({
  nome: z.string().trim().min(3),
  cpf: z.string().transform(soDigitos).pipe(z.string().length(11)),
  telefone: z.string().transform(soDigitos).pipe(z.string().min(10).max(13)),
  profissional: z.string().trim().min(1),
  especialidade: z.string().trim().min(1),
  inicio: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
});

export const esquemaRemarcacao = z.object({
  inicio: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
});

export type NovaConsulta = z.infer<typeof esquemaNovaConsulta>;
export type Remarcacao = z.infer<typeof esquemaRemarcacao>;
