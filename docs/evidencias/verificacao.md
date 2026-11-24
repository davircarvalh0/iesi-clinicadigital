# Verificação reproduzível (US-20)

Gerado por `npm run verificar` em 2026-11-24T20:36:33.523Z (duração 205 s).
Commit `6c8a95b`. Projeto Compose isolado `iesi-clinicadigital-verificacao`, configuração `.env.example`, `CANAL_ENVIO=log`.
Versões: Node v24.11.1, npm 11.6.2, Docker 29.0.1, Compose 2.40.3-desktop.1.

Resultado: **APROVADA**: todas as etapas passaram. Testes: 251 de 255 aprovados, 4 pulados.

| Etapa | Verificação | Resultado | Testes | Duração | Comando |
| --- | --- | --- | --- | --- | --- |
| 1. Estática | Typecheck de todos os workspaces | OK | — | 2.9 s | `npm run typecheck` |
| 1. Estática | Build de todos os workspaces | OK | — | 4.0 s | `npm run build` |
| 1. Estática | Testes unitários (sem banco) | OK | 131/135 (4 pulados) | 15.5 s | `npm test` |
| 1. Estática | Testes dos roteiros (dados fictícios e contagem) | OK | 7/7 | 0.7 s | `npm run test:scripts` |
| 2. Ambiente | Compose isolado do zero (up --build --wait) | OK | — | 23.4 s | `docker compose -p iesi-clinicadigital-verificacao --env-file .env.example up -d --build --wait` |
| 3. Banco | Banco notificacao_teste: criar | OK | — | 0.4 s | `docker compose -p iesi-clinicadigital-verificacao --env-file .env.example exec -T db-notificacao psql -U notificacao -d notificacao -c CREATE DATABASE notificacao_teste` |
| 3. Banco | Banco notificacao_teste: migrações | OK | — | 4.2 s | `npx prisma migrate deploy` |
| 3. Banco | Banco cadastro_teste: criar | OK | — | 0.4 s | `docker compose -p iesi-clinicadigital-verificacao --env-file .env.example exec -T db-cadastro psql -U cadastro -d cadastro -c CREATE DATABASE cadastro_teste` |
| 3. Banco | Banco cadastro_teste: migrações | OK | — | 3.1 s | `npx prisma migrate deploy` |
| 3. Banco | Notificação: suíte completa com banco | OK | 61/61 | 12.7 s | `npm test -w @clinica/notificacao` |
| 3. Banco | Cadastro: test:us01:db | OK | 4/4 | 1.4 s | `npm run test:us01:db -w @clinica/cadastro` |
| 3. Banco | Cadastro: test:us02:api | OK | 4/4 | 1.8 s | `npm run test:us02:api -w @clinica/cadastro` |
| 3. Banco | Cadastro: test:us14:db | OK | 6/6 | 2.0 s | `npm run test:us14:db -w @clinica/cadastro` |
| 4. Integração | Carga fictícia (npm run demo:popular) | OK | — | 2.5 s | `node scripts/popular-demo.mjs` |
| 4. Integração | US-03 | OK | 2/2 | 5.7 s | `node --test --test-timeout=300000 scripts/us03.integracao.test.mjs` |
| 4. Integração | US-04 | OK | 3/3 | 3.0 s | `node --test --test-timeout=300000 scripts/us04.integracao.test.mjs` |
| 4. Integração | US-05 | OK | 1/1 | 13.4 s | `node --test --test-timeout=300000 scripts/us05.integracao.test.mjs` |
| 4. Integração | US-06 | OK | 3/3 | 14.1 s | `node --test --test-timeout=300000 scripts/us06.integracao.test.mjs` |
| 4. Integração | US-07 | OK | 4/4 | 3.5 s | `node --test --test-timeout=300000 scripts/us07.integracao.test.mjs` |
| 4. Integração | US-08 | OK | 2/2 | 14.1 s | `node --test --test-timeout=300000 scripts/us08.integracao.test.mjs` |
| 4. Integração | US-09 | OK | 2/2 | 1.8 s | `node --test --test-timeout=300000 scripts/us09.integracao.test.mjs` |
| 4. Integração | US-11 | OK | 2/2 | 1.9 s | `node --test --test-timeout=300000 scripts/us11.integracao.test.mjs` |
| 4. Integração | US-13 | OK | 2/2 | 5.0 s | `node --test --test-timeout=300000 scripts/us13.integracao.test.mjs` |
| 4. Integração | US-14 | OK | 6/6 | 29.2 s | `node --test --test-timeout=300000 scripts/us14.integracao.test.mjs` |
| 4. Integração | US-15 | OK | 2/2 | 0.9 s | `node --test --test-timeout=300000 scripts/us15.integracao.test.mjs` |
| 4. Integração | US-16 | OK | 1/1 | 8.7 s | `node --test --test-timeout=300000 scripts/us16.integracao.test.mjs` |
| 4. Integração | US-17 | OK | 4/4 | 0.4 s | `node --test --test-timeout=300000 scripts/us17.integracao.test.mjs` |
| 4. Integração | US-18 | OK | 3/3 | 18.2 s | `node --test --test-timeout=300000 scripts/us18.integracao.test.mjs` |
| 4. Integração | US-01: reinício do Cadastro | OK | 1/1 | 5.4 s | `node --test scripts/us01.reinicio.test.mjs` |

Os dados usados são fictícios (CPF inválido por construção, telefones na faixa 81 9 0000-0xxx). Nenhuma mensagem real é enviada.
