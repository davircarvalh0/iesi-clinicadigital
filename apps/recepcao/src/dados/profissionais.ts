// Lista fixa enquanto não existe um serviço de cadastro de profissionais.
export const PROFISSIONAIS = [
  { nome: 'Dra. Ana Lima', especialidade: 'Cardiologia' },
  { nome: 'Dr. Paulo Menezes', especialidade: 'Pediatria' },
  { nome: 'Dra. Carla Ribeiro', especialidade: 'Clínica geral' },
];

export const ESPECIALIDADES = [...new Set(PROFISSIONAIS.map((p) => p.especialidade))];

const CORES: Record<string, string> = {
  Cardiologia: '#c95c70',
  Pediatria: '#d7a437',
  'Clínica geral': '#3f897e',
};

export const corDaEspecialidade = (especialidade: string) => CORES[especialidade] ?? '#8e9f9c';
