# Clínica Digital · Vida & Saúde

Protótipo acadêmico (IESI · CIn/UFPE): plataforma orientada a eventos para clínicas de pequeno porte.

## Como rodar

```bash
cp .env.example .env        # ajuste CANAL_ENVIO, WHATSAPP_* e LEMBRETE_ANTECEDENCIA_MINUTOS
docker compose up --build
```

| O quê | Onde |
| --- | --- |
| Tela da recepção | http://localhost:8080 |
| Agendamento (API) | http://localhost:3001 |
| Notificação (API) | http://localhost:3002 |
| Cadastro único (API) | http://localhost:3003 |
| Painel do RabbitMQ | http://localhost:15672 (clinica / clinica) |

Para popular a agenda com as consultas do protótipo (passa pela API, então gera eventos e lembretes reais):

```bash
npm run demo:popular
```

### Roteiro da demonstração

- **Caminho feliz:** "Nova consulta" → o feed mostra *Evento publicado* (Agendamento) e *Lembrete programado* (Notificação); no horário, *Lembrete enviado*.
- **Cancelar / Remarcar:** o selo do lembrete muda sozinho para *cancelado* ou é reprogramado.
- **Notificação fora do ar:** desligue o interruptor do "Modo demonstração", faça alterações (o contador de eventos na fila sobe) e religue: a fila é processada. Também funciona com `docker compose stop notificacao`.
- **Evento duplicado:** "Reenviar último evento" publica de novo o mesmo `id_evento`; o feed mostra *Evento duplicado ignorado*.

### Desenvolvimento local (sem containers para os serviços)

```bash
npm install                 # também compila @clinica/eventos e gera os clients do Prisma
npm run infra               # sobe RabbitMQ e os três Postgres
cp services/agendamento/.env.example services/agendamento/.env
cp services/notificacao/.env.example services/notificacao/.env
cp services/cadastro/.env.example services/cadastro/.env
npm run prisma:deploy -w @clinica/agendamento && npm run prisma:deploy -w @clinica/notificacao
npm run dev:agendamento     # em terminais separados
npm run dev:notificacao
npm run prisma:deploy -w @clinica/cadastro
npm run dev:cadastro
npm run dev:recepcao        # http://localhost:5173
```

Ao mudar um `schema.prisma`: `npm run prisma:migrate -w @clinica/<servico>`.
Ao mudar o pacote de eventos: `npm run build -w @clinica/eventos`.

## Estrutura

```
packages/eventos        contrato compartilhado: envelope, tipos dos eventos e nomes do barramento
services/agendamento    consultas + outbox + publicador (Postgres próprio, porta 3001)
services/notificacao    consumidor idempotente + lembretes + rotina de envio + canais (Postgres próprio, porta 3002)
services/cadastro       paciente mestre por CPF + busca/edição + outbox (Postgres próprio, porta 3003)
  src/canais            adaptadores de terceiros: CanalEnvio, CanalWhatsApp, CanalLog
apps/recepcao           tela React (Vite); chama /api/agendamento, /api/notificacao e /api/cadastro
infra/rabbitmq          topologia declarada (exchange clinica.eventos, fila notificacao.consultas, fila de erros)
```

### Fluxo

```
Recepção ──HTTP──▶ Agendamento ──(transação)──▶ consultas + outbox
                                   publicador ──▶ clinica.eventos (topic)
                                                    │ consulta.*
                                                    ▼
                                    notificacao.consultas ──(falhas repetidas)──▶ notificacao.consultas.erros
                                                    │
                                     Notificação: eventos_processados + lembretes
                                       rotina de envio ──▶ CanalEnvio (WhatsApp | log)
Recepção ──HTTP (polling)──▶ Notificação GET /lembretes
```

Regras: serviços não se chamam diretamente, cada um tem seu banco, terceiros entram por adaptadores
e eventos não carregam conteúdo clínico.

## Pacientes reais (US-07)

Clique em **Pacientes** para buscar por nome (sem distinguir maiúsculas/minúsculas) ou CPF, com ou sem máscara.
**Editar contatos** altera telefone e e-mail no Cadastro único e exibe o retorno do servidor.
O total é contado no cadastro mestre, independentemente de consultas, filtros e paginação.
Agendamentos criam/vinculam pacientes por CPF via RabbitMQ; novas consultas não sobrescrevem contatos já corrigidos.
Alterações publicam `paciente.atualizado` v1 e atualizam a cópia de contato dos lembretes pendentes.

```bash
npm run typecheck
npm run build
npm test
# Com Compose ativo e CANAL_ENVIO=log, em ambiente local de demonstração:
npm run test:integracao
```

Os testes de integração criam somente dados fictícios e os mantêm para inspeção. Para outra porta do gateway,
defina `TEST_BASE_URL` (por exemplo, `http://localhost:18080`). Os contratos REST, eventos, evidências e limites
estão em [docs/US-07.md](docs/US-07.md).

## Reutilizar paciente no agendamento (US-08)

Em **Nova consulta**, digite o CPF completo e clique em **Buscar CPF**. Se o Cadastro encontrar o
paciente, o formulário preenche nome e telefone e usa o ID mestre. Para CPF novo, informe os
dados manualmente. Se o Cadastro estiver indisponível, é possível tentar novamente ou continuar
com dados manuais. A agenda mostra o vínculo pendente até receber a confirmação por evento.

O contrato e o roteiro de validação em um Compose isolado estão em [docs/US-08.md](docs/US-08.md).
