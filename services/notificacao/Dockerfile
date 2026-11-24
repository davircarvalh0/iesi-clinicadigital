# Contexto de build: raiz do repositório.
FROM node:24-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/eventos packages/eventos
COPY services/notificacao services/notificacao
RUN npm ci --include-workspace-root -w @clinica/eventos -w @clinica/notificacao
RUN npm run build -w @clinica/notificacao

WORKDIR /app/services/notificacao
EXPOSE 3002
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
