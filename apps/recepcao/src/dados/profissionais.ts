const CORES: Record<string, string> = {
  Cardiologia: '#c95c70',
  Pediatria: '#d7a437',
  'Clínica geral': '#3f897e',
};

export const corDaEspecialidade = (especialidade: string) => CORES[especialidade] ?? '#8e9f9c';
