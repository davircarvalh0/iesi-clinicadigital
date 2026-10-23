import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Em dev, o Vite repassa /api/* para os serviços; no Docker, o nginx faz o mesmo (nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/agendamento': {
        target: process.env.AGENDAMENTO_URL ?? 'http://localhost:3001',
        rewrite: (p) => p.replace(/^\/api\/agendamento/, ''),
      },
      '/api/notificacao': {
        target: process.env.NOTIFICACAO_URL ?? 'http://localhost:3002',
        rewrite: (p) => p.replace(/^\/api\/notificacao/, ''),
      },
    },
  },
});
