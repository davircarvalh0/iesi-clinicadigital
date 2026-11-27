import { z } from 'zod';

const soDigitos = (v: string) => v.replace(/\D/g, '');

// Só o formato: 11 dígitos, com ou sem máscara. O dígito verificador não é conferido (decisão do grupo).
const cpf = z.string('Informe o CPF.').trim()
  .regex(/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/, 'CPF inválido. Use 11 dígitos ou 000.000.000-00.')
  .transform(soDigitos);

// Mesma regra do Cadastro: DDD sem zero à esquerda, número de 8 ou 9 dígitos e código do país opcional.
const telefone = z.string('Informe o telefone.').transform(soDigitos)
  .refine((v) => /^(?:55)?[1-9]\d{9,10}$/.test(v), 'Telefone inválido. Informe DDD e número.');

const inicio = z.iso.datetime({ offset: true, error: 'Data e hora inválidas. Use o formato ISO 8601 com fuso.' })
  .transform((v) => new Date(v))
  .refine((v) => v.getTime() > Date.now(), 'A consulta deve começar no futuro.');

export const esquemaNovaConsulta = z.object({
  idPaciente: z.uuid('Identificador do paciente inválido.').optional(),
  nome: z.string('Informe o nome.').trim().min(3, 'Nome deve ter ao menos 3 caracteres.'),
  cpf,
  telefone,
  profissional: z.string('Informe o profissional.').trim().min(1, 'Informe o profissional.'),
  especialidade: z.string('Informe a especialidade.').trim().min(1, 'Informe a especialidade.'),
  inicio,
});

export const esquemaRemarcacao = z.object({ inicio });

export type NovaConsulta = z.infer<typeof esquemaNovaConsulta>;
export type Remarcacao = z.infer<typeof esquemaRemarcacao>;
