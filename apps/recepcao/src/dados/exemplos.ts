// Dados fictícios para o botão "Preencher exemplo" do formulário.
const NOMES = [
  'Ana Beatriz Moura',
  'Carlos Eduardo Vasconcelos',
  'Fernanda Lopes Araújo',
  'Rafael Tavares Lins',
  'Beatriz Correia Melo',
  'Gustavo Henrique Pires',
];

const digitos = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

export function pacienteNovo(nomesEmUso: string[]) {
  const livres = NOMES.filter((n) => !nomesEmUso.includes(n));
  const nome = (livres.length ? livres : NOMES)[Math.floor(Math.random() * (livres.length || NOMES.length))];
  return { nome, cpf: digitos(11), telefone: `819${digitos(8)}` };
}

export const PACIENTE_PADRAO = { nome: 'Maria José Albuquerque', cpf: '12345678900', telefone: '81988123401' };
