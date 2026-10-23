# Contexto de build: raiz do repositório.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/recepcao apps/recepcao
RUN npm ci --include-workspace-root -w @clinica/recepcao --ignore-scripts
RUN npm run build -w @clinica/recepcao

FROM nginx:1.27-alpine
COPY apps/recepcao/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/recepcao/dist /usr/share/nginx/html
EXPOSE 80
