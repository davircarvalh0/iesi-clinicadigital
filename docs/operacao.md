# Operação · Clínica Digital

Procedimentos para subir, verificar, demonstrar e diagnosticar o protótipo. Os comandos valem para PowerShell e
bash, salvo indicação.

## Subir e derrubar

```bash
cp .env.example .env                 # CANAL_ENVIO=log por padrão: nenhuma mensagem sai da clínica
docker compose up --build --wait     # termina quando os serviços migraram e responderam à saúde
npm run demo:popular                 # carga fictícia (só grava se a agenda estiver vazia)
docker compose down                  # mantém os dados; acrescente -v para apagar os volumes
```

| Endereço | O quê |
| --- | --- |
| http://localhost:8080 | Recepção (Agenda, Pacientes, Lembretes) |
| http://localhost:3001 · 3002 · 3003 | APIs do Agendamento, da Notificação e do Cadastro |
| http://localhost:15672 | Painel do RabbitMQ (`clinica` / `clinica`) |

Para rodar um segundo ambiente ao mesmo tempo, mude as portas (`RECEPCAO_PORTA` etc., veja `.env.example`) e use outro
nome de projeto (`docker compose -p <nome>`).

## Variáveis da Notificação

| Variável | Padrão | Uso |
| --- | --- | --- |
| `CANAL_ENVIO` | `log` | `log` (simulado) ou `whatsapp`. Sem credenciais, o envio cai para simulado |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`… | — | Credenciais da WhatsApp Cloud API. Nunca vão para o git |
| `WHATSAPP_DESTINOS_PERMITIDOS` | vazio | Telefones de teste que podem receber mensagem real. Vazio bloqueia todo envio real (US-15) |
| `LEMBRETE_ANTECEDENCIA_MINUTOS` | 1440 | De 1 a 1439 ativa o modo demonstração (US-10) |
| `ROTINA_ENVIO_INTERVALO_MS` | 5000 | Intervalo da rotina de envio |
| `ENVIO_MAX_TENTATIVAS` | 3 | Tentativas por programação |
| `ENVIO_RESERVA_EXPIRA_MS` | 60000 | Reserva mais antiga que isso é de uma chamada interrompida. Precisa ser maior que 10 s (US-15) |
| `OPERACAO_HABILITADA` | `false` | Libera `/operacao` (fila de erros). Só no ambiente de demonstração |

Uma configuração inválida interrompe a inicialização e registra a variável no log. Ao subir, a Notificação registra
o modo de envio e o motivo (`[canais] modo de envio …`). A tela **Lembretes** mostra o mesmo.

## Verificar

```bash
npm run verificar -- --rapido   # typecheck, build e testes unitários, sem Docker (cerca de 20 s)
npm run verificar               # tudo, em um Compose isolado com portas 3xxxx, removido ao final
npm run verificar -- --manter   # idem, deixando o ambiente no ar em http://localhost:38080
```

O relatório fica em `docs/evidencias/verificacao.md`. A CI (`.github/workflows/verificacao.yml`) roda as duas versões a
cada push e pull request e guarda o relatório e os logs como artefato. Detalhes em [US-20.md](US-20.md) e
[US-21.md](US-21.md). Para rodar uma suíte isolada, veja os comandos `test:usNN` no `package.json` e
[rastreabilidade.md](rastreabilidade.md).

## Roteiros de diagnóstico

**Um lembrete não saiu.** Abra **Lembretes → Ver trilha** e confira, na ordem:

- Atividade `lembrete.bloqueado`: falta autorização de WhatsApp. Registre-a em **Pacientes → Editar cadastro**. A nova
  autorização libera os lembretes de consultas futuras (US-14).
- Situação `falhou`: veja o motivo e as tentativas. "Destino fora da lista de teste" indica um envio real para um
  número fora de `WHATSAPP_DESTINOS_PERMITIDOS` (US-15).
- Situação `programado` com previsão no futuro: é a antecedência de 24 h (US-10).
- Nenhuma atividade: o evento não chegou. Confira o painel de eventos (*Evento na outbox, aguardando*) e a fila no
  RabbitMQ.

**Envio sem confirmação (`incerto`).** O WhatsApp não respondeu depois do pedido, ou a Notificação parou durante a
chamada. A mensagem pode ter chegado. Confira no gerenciador do WhatsApp Business ou com o paciente. Depois, na
trilha, informe seu nome e escolha **Reenviar** (que pode duplicar a mensagem) ou **Manter sem reenvio**. A decisão
fica registrada. Pela API: `POST /api/notificacao/lembretes/<idConsulta>/resolucao`.

**Notificação fora do ar.** A agenda mostra "Lembrete: situação desconhecida" e a faixa de estado marca o serviço como
indisponível (US-18). Os eventos ficam na fila `notificacao.consultas` e são processados quando o serviço volta. Para
simular, use o interruptor do **Modo demonstração** ou `docker compose stop notificacao`.

**Mensagem na fila de erros.** Com `OPERACAO_HABILITADA=true`:

```bash
curl http://localhost:8080/api/notificacao/operacao/erros
curl -X POST http://localhost:8080/api/notificacao/operacao/erros/<idEvento>/reprocessar \
     -H 'Content-Type: application/json' -d '{"solicitante":"<seu nome>"}'
```

O resumo traz tipo, id, tentativas e motivo, sem dados pessoais do payload (US-06).

**O gateway demora a responder com um serviço parado.** O nginx tenta resolver o nome do container. Por isso a
recepção usa timeout de 8 s por requisição e marca o dado como desatualizado (US-18).

**Docker indisponível.** O daemon precisa estar ativo (IM-01). `npm run verificar -- --rapido` funciona sem Docker.

## Migrações

Os containers aplicam `prisma migrate deploy` ao subir. Em desenvolvimento local:

```bash
npm run prisma:deploy -w @clinica/<servico>   # aplica
npm run prisma:migrate -w @clinica/<servico>  # cria a partir do schema.prisma
```

As migrações só acrescentam. Tabelas novas desta fase: `tentativas_envio` (US-13) e `resolucoes_envio` (US-15).

## Dados pessoais

- Use só dados fictícios: CPF `000.000.xxx` com dígito verificador inválido, telefones `81 9 0000-0xxx` e sobrenome "Exemplo".
- Atividades, logs, eventos do painel, listagem de lembretes e trilha não trazem CPF nem telefone. A
  Notificação guarda o contato só para o envio (US-16).
- O `solicitante` das decisões e dos reprocessamentos é o nome de quem opera a recepção, não do paciente.
