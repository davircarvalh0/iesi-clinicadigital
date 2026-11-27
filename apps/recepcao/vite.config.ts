import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Em desenvolvimento, o Vite faz o papel do gateway: /api/<serviço>/* vai para a porta do serviço.
// No Docker, o nginx faz o mesmo (nginx.conf).
const servicos = {
  agendamento: process.env.AGENDAMENTO_URL ?? 'http://localhost:3001',
  notificacao: process.env.NOTIFICACAO_URL ?? 'http://localhost:3002',
  cadastro: process.env.CADASTRO_URL ?? 'http://localhost:3003',
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      Object.entries(servicos).map(([nome, alvo]) => [
        `/api/${nome}`,
        { target: alvo, rewrite: (caminho: string) => caminho.replace(new RegExp(`^/api/${nome}`), '') },
      ]),
    ),
  },
});
