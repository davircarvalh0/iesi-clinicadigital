// Popula a agenda com as consultas do protótipo, passando pela API (gera eventos e lembretes de verdade).
// Uso: npm run demo:popular   (com o docker compose no ar)
const BASE = process.env.AGENDAMENTO_URL ?? 'http://localhost:8080/api/agendamento';

const dia = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(new Date(Date.now() + n * 86_400_000));
const em = (n, hora) => `${dia(n)}T${hora}:00-03:00`;

const CONSULTAS = [
  { nome: 'Maria José Albuquerque', cpf: '12345678900', telefone: '81988123401', profissional: 'Dra. Ana Lima', especialidade: 'Cardiologia', inicio: em(0, '08:30') },
  { nome: 'Davi Lins Barbosa', cpf: '23456789011', telefone: '81999027745', profissional: 'Dr. Paulo Menezes', especialidade: 'Pediatria', inicio: em(0, '10:00') },
  { nome: 'João Pedro Cavalcanti', cpf: '34567890122', telefone: '81996542210', profissional: 'Dra. Carla Ribeiro', especialidade: 'Clínica geral', inicio: em(0, '14:30') },
  { nome: 'Lúcia Ferreira Santos', cpf: '45678901233', telefone: '81987401187', profissional: 'Dra. Ana Lima', especialidade: 'Cardiologia', inicio: em(1, '09:00') },
  { nome: 'Severino Araújo Neto', cpf: '56789012344', telefone: '81991235566', profissional: 'Dra. Carla Ribeiro', especialidade: 'Clínica geral', inicio: em(2, '11:00') },
  { nome: 'Davi Lins Barbosa', cpf: '23456789011', telefone: '81999027745', profissional: 'Dr. Paulo Menezes', especialidade: 'Pediatria', inicio: em(2, '15:30'), cancelar: true },
];

async function chamar(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

const existentes = await chamar('/consultas');
if (existentes.length) {
  console.log(`A agenda já tem ${existentes.length} consulta(s); nada a fazer.`);
  process.exit(0);
}

for (const { cancelar, ...dados } of CONSULTAS) {
  const consulta = await chamar('/consultas', { method: 'POST', body: JSON.stringify(dados) });
  console.log(`agendada: ${dados.nome} em ${dados.inicio}`);
  if (cancelar) {
    await new Promise((r) => setTimeout(r, 1500));
    await chamar(`/consultas/${consulta.id}`, { method: 'DELETE' });
    console.log(`cancelada: ${dados.nome}`);
  }
}
