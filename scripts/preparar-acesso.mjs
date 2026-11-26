import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Cria apenas as credenciais que estiverem faltando; nunca substitui uma senha existente.
const arquivo = fileURLToPath(new URL('../.env', import.meta.url));
let texto = existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : '';
const valores = { AUTH_SECRET: randomBytes(32).toString('hex'), ADMIN_EMAIL: 'admin@clinica.local', ADMIN_SENHA: randomBytes(24).toString('base64url') };
let alterado = false;
for (const [chave, valor] of Object.entries(valores)) {
  const linha = new RegExp(`^${chave}=(.*)$`, 'm');
  const encontrada = texto.match(linha);
  if (encontrada?.[1].trim()) continue;
  alterado = true;
  if (encontrada) texto = texto.replace(linha, `${chave}=${valor}`);
  else texto += `${texto && !texto.endsWith('\n') ? '\n' : ''}${chave}=${valor}\n`;
}
if (alterado) writeFileSync(arquivo, texto, { mode: 0o600 });
console.log('Configuração de acesso pronta. Consulte ADMIN_EMAIL e ADMIN_SENHA no .env local.');
