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
npm run infra               # sobe só RabbitMQ e os dois Postgres
cp services/agendamento/.env.example services/agendamento/.env
cp services/notificacao/.env.example services/notificacao/.env
npm run prisma:deploy -w @clinica/agendamento && npm run prisma:deploy -w @clinica/notificacao
npm run dev:agendamento     # em terminais separados
npm run dev:notificacao
npm run dev:recepcao        # http://localhost:5173
```

Ao mudar um `schema.prisma`: `npm run prisma:migrate -w @clinica/<servico>`.
Ao mudar o pacote de eventos: `npm run build -w @clinica/eventos`.

## Estrutura

```
packages/eventos        contrato compartilhado: envelope, tipos dos eventos e nomes do barramento
services/agendamento    consultas + outbox + publicador (Postgres próprio, porta 3001)
services/notificacao    consumidor idempotente + lembretes + rotina de envio + canais (Postgres próprio, porta 3002)
  src/canais            adaptadores de terceiros: CanalEnvio, CanalWhatsApp, CanalLog
apps/recepcao           tela React (Vite); chama /api/agendamento e /api/notificacao
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
