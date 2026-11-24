// Dados fictícios do protótipo (US-19). Nenhum dado aqui pertence a uma pessoa real:
// - CPF: prefixo 000.000 e dígitos verificadores propositalmente errados (não existe CPF válido igual);
// - telefone: DDD 81 + faixa 9 0000-0xxx, não atribuída a linhas móveis;
// - nome: sobrenome "Exemplo", para ninguém confundir com um paciente.

/** Dígitos verificadores de um CPF a partir dos 9 primeiros dígitos. */
export function digitosVerificadores(base9) {
  const dv = (digitos) => {
    const soma = [...digitos].reduce((acc, d, i) => acc + Number(d) * (digitos.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(base9);
  return `${d1}${dv(`${base9}${d1}`)}`;
}

export function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  return digitosVerificadores(cpf.slice(0, 9)) === cpf.slice(9);
}

/** CPF fictício: 000.000.NNN com o último dígito verificador trocado, logo sempre inválido. */
export function cpfFicticio(n) {
  const base = `000000${String(n).padStart(3, '0')}`;
  const [d1, d2] = digitosVerificadores(base);
  return `${base}${d1}${(Number(d2) + 1) % 10}`;
}

export const telefoneFicticio = (n) => `8190000${String(n).padStart(4, '0')}`;

const PACIENTES = [
  { nome: 'Maria Exemplo Albuquerque' },
  { nome: 'Davi Exemplo Barbosa' },
  { nome: 'João Exemplo Cavalcanti' },
  { nome: 'Lúcia Exemplo Santos' },
  { nome: 'Severino Exemplo Neto' },
].map((p, i) => ({ ...p, cpf: cpfFicticio(i + 1), telefone: telefoneFicticio(i + 1) }));

const [maria, davi, joao, lucia, severino] = PACIENTES;

/** Dia (AAAA-MM-DD) em America/Recife, deslocado n dias a partir de agora. */
const dia = (n, agora) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' })
  .format(new Date(agora + n * 86_400_000));
const em = (n, hora, agora) => `${dia(n, agora)}T${hora}:00-03:00`;

/** Consultas da demonstração. A última é cancelada logo depois de agendada. */
export function consultasDemo(agora = Date.now()) {
  return [
    { ...maria, profissional: 'Dra. Ana Exemplo', especialidade: 'Cardiologia', inicio: em(0, '08:30', agora) },
    { ...davi, profissional: 'Dr. Paulo Exemplo', especialidade: 'Pediatria', inicio: em(0, '10:00', agora) },
    { ...joao, profissional: 'Dra. Carla Exemplo', especialidade: 'Clínica geral', inicio: em(0, '14:30', agora) },
    { ...lucia, profissional: 'Dra. Ana Exemplo', especialidade: 'Cardiologia', inicio: em(1, '09:00', agora) },
    { ...severino, profissional: 'Dra. Carla Exemplo', especialidade: 'Clínica geral', inicio: em(2, '11:00', agora) },
    { ...davi, profissional: 'Dr. Paulo Exemplo', especialidade: 'Pediatria', inicio: em(2, '15:30', agora), cancelar: true },
  ];
}

export const PACIENTES_DEMO = PACIENTES;
