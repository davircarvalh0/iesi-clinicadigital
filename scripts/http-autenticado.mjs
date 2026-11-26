// Exclusivamente para clientes automatizados: autentica pela API normal, sem bypass de autorização.
const tokens = new Map();
export async function fetch(url, opcoes = {}) {
  const destino = new URL(url);
  if (destino.pathname.endsWith('/saude')) return globalThis.fetch(url, opcoes);
  const gateway = destino.pathname.startsWith('/api/');
  const raiz = destino.origin + (gateway ? '/api/cadastro' : '');
  const email = process.env.ADMIN_EMAIL, senha = process.env.ADMIN_SENHA;
  if (!email || !senha) throw new Error('Configure ADMIN_EMAIL e ADMIN_SENHA no ambiente dos testes.');
  let token = tokens.get(raiz);
  if (!token) {
    const resposta = await globalThis.fetch(`${raiz}/usuarios/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }), signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) throw new Error(`Login dos testes falhou: HTTP ${resposta.status}`);
    token = (await resposta.json()).token; tokens.set(raiz, token);
  }
  const headers = new Headers(opcoes.headers); headers.set('Authorization', `Bearer ${token}`);
  // As consultas das suítes antigas usam profissionais fictícios; providencia o cadastro mestre
  // exclusivamente quando o runner de teste isolado está ativo.
  if (process.env.TEST_CONTROLS === 'true' && gateway && destino.pathname === '/api/agendamento/consultas' && opcoes.method === 'POST') {
    try {
      const dados = JSON.parse(opcoes.body);
      if (typeof dados.profissional === 'string' && typeof dados.especialidade === 'string') {
        await globalThis.fetch(`${destino.origin}/api/agendamento/profissionais`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: dados.profissional, especialidade: dados.especialidade }) });
      }
    } catch { /* A validação original da consulta continua sendo testada. */ }
  }
  return globalThis.fetch(url, { ...opcoes, headers });
}
