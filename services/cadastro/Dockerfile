FROM node:24-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/eventos packages/eventos
COPY services/cadastro services/cadastro
RUN npm ci --include-workspace-root -w @clinica/eventos -w @clinica/cadastro
RUN npm run build -w @clinica/cadastro
WORKDIR /app/services/cadastro
EXPOSE 3003
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
