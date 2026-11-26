# Arquitetura · Clínica Digital

Protótipo acadêmico (IESI · CIn/UFPE) de uma plataforma orientada a eventos para clínicas pequenas, só com dados
fictícios. O documento descreve o que está no código desta versão. Os contratos detalhados estão em
[contratos.md](contratos.md) e os procedimentos de operação em [operacao.md](operacao.md).

## Objetivo do produto

A recepção cadastra ou reconhece o paciente uma única vez e gerencia as consultas. Serviços integrados por eventos
programam, ajustam e registram os lembretes de forma verificável.

Resultado demonstrável:

- a consulta gera o vínculo com o paciente mestre e a programação do lembrete;
- remarcação e cancelamento se propagam;
- um evento duplicado não duplica o efeito;
- uma indisponibilidade recupera o processamento;
- o modo de envio fica explícito.

## Visão geral

```
                    ┌──────────────── Recepção (React + nginx, :8080) ────────────────┐
                    │  /api/agendamento     /api/notificacao      /api/cadastro       │
                    └───────┬──────────────────────┬─────────────────────┬────────────┘
                       HTTP │                 HTTP │ (polling)      HTTP │
                ┌───────────▼───────┐   ┌──────────▼──────────┐   ┌──────▼───────────┐
                │ Agendamento :3001 │   │ Notificação :3002   │   │ Cadastro :3003   │
                │ consultas, outbox │   │ lembretes, trilha,  │   │ paciente mestre, │
                │ projeção paciente │   │ autorização (cópia) │   │ autorizações,    │
                │                   │   │ rotina de envio     │   │ outbox           │
                └───┬──────────▲────┘   └──▲──────────┬───────┘   └───▲─────────┬────┘
                    │ Postgres │           │ Postgres │ CanalEnvio    │ Postgres│
                    │ próprio  │           │ próprio  ▼ (log|WhatsApp)│ próprio │
            publica │          │ consome   │ consome                  │ consome │ publica
                    ▼          │           │                          │         ▼
              ┌─────────────────────────── RabbitMQ: clinica.eventos (topic) ─────────────┐
              │ consulta.agendada | consulta.reagendada | consulta.cancelada               │
              │ paciente.atualizado | paciente.autorizacao_alterada                        │
              └────────────────────────────────────────────────────────────────────────────┘
```

Regras da arquitetura:

- **Um banco por serviço.** Nenhum serviço lê o banco de outro.
- **Os serviços não se chamam diretamente.** O que um serviço precisa saber de outro chega por evento, e cada serviço
  guarda uma projeção local (a Notificação guarda contato e autorização; o Agendamento guarda o vínculo com o paciente).
- **Outbox transacional** no Agendamento e no Cadastro: o fato e o evento são gravados na mesma transação, e um
  publicador separado envia ao broker com confirmação (publisher confirms).
- **Consumidores idempotentes:** cada `id_evento` é processado uma única vez, registrado na mesma transação do efeito.
- **Terceiros entram por adaptadores:** `CanalEnvio` tem as implementações `CanalLog` (simulado) e `CanalWhatsApp` (Graph API).
- **Os eventos não levam conteúdo clínico.** As atividades e os logs não guardam nome, CPF nem telefone (US-16).

## Serviços

| Serviço | Responsabilidade | Banco (tabelas principais) | Publica | Consome |
| --- | --- | --- | --- | --- |
| Agendamento | Agenda: criar, remarcar, cancelar; `sequencia` por consulta (US-11) | `consultas`, `outbox`, projeção do paciente | `consulta.*` | `paciente.atualizado` (fila `agendamento.pacientes`) |
| Cadastro | Paciente mestre por CPF, edição com revisão, autorizações de contato por canal | `pacientes`, `autorizacoes_contato`, `outbox` | `paciente.atualizado`, `paciente.autorizacao_alterada` | `consulta.agendada` (fila `cadastro.consultas`) |
| Notificação | Lembretes: horário (US-10), estado (US-11), resultado (US-12), trilha (US-13), autorização (US-14), envio incerto (US-15) | `lembretes`, `tentativas_envio`, `resolucoes_envio`, `autorizacoes_contato` (cópia), `contatos_pacientes`, `eventos_processados`, `atividades`, `reprocessamentos` | — | `consulta.*`, `paciente.atualizado`, `paciente.autorizacao_alterada` (fila `notificacao.consultas`) |
| Recepção | Telas Agenda, Pacientes e Lembretes; painel de eventos; modo demonstração | — | — | HTTP dos três serviços, pelo gateway nginx |

## Fluxos principais

**Agendar.** A recepção faz `POST /consultas`. O Agendamento grava a consulta e `consulta.agendada` na outbox, e o
publicador envia o evento ao broker.
- O Cadastro cria ou reconhece o paciente pelo CPF e publica `paciente.atualizado`. O Agendamento recebe e vincula
  a consulta ao paciente mestre.
- A Notificação programa o lembrete para 24 h antes da consulta e grava o `id_evento` como processado.

**Remarcar e cancelar.** O Agendamento incrementa a `sequencia` e publica `consulta.reagendada` ou
`consulta.cancelada`. A Notificação descarta eventos com sequência antiga. `cancelado` é um estado terminal. Um
envio já em curso, já concluído ou incerto não é escondido pelo cancelamento (US-11, US-15).

**Enviar.** A rotina de envio da Notificação roda a cada 5 s e segue esta ordem:
1. Recupera reservas vencidas (US-15).
2. Confere se a consulta já começou (US-10) e consulta a autorização de contato (US-14).
3. Reserva o lembrete (`enviando`) e registra a tentativa na mesma transação (US-11, US-13).
4. Chama o canal.
5. Grava o desfecho:
   - `simulado` ou `aceito_provedor`: envio concluído;
   - `programado`: falha comum, com nova tentativa;
   - `falhou`: tentativas esgotadas ou falha definitiva;
   - `incerto`: a mensagem pode ter saído, e o lembrete não é repetido sozinho.

**Falhas de processamento.** Uma mensagem inválida vai direto para a fila de erros do serviço, com `x-motivo` (US-04).
Uma falha transitória é republicada até 3 vezes e depois copiada para a fila de erros, sempre com confirmação do
broker antes do `ack` (US-05). A fila de erros pode ser inspecionada e reprocessada por `/operacao` (US-06).

## Estados do lembrete

```
                    ┌──────── remarcação (reprograma, zera resultado; trilha fica) ───────┐
                    ▼                                                                     │
  (evento) ──▶ programado ──reserva──▶ enviando ──┬──▶ simulado | aceito_provedor ────────┤
                 │  ▲                             ├──▶ programado (falha, nova tentativa) │
                 │  └─ reenviar (recepção) ─┐     ├──▶ falhou (esgotou / definitiva) ─────┤
                 │                          │     └──▶ incerto (sem confirmação) ─────────┘
                 ├──▶ bloqueado (sem autorização; liberado por nova autorização)
                 ├──▶ falhou (consulta já começou)
                 └──▶ cancelado (terminal)          incerto ──manter sem reenvio──▶ incerto (resolvido)
```

`enviado` existe só para registros anteriores à US-12 ("resultado sem classificação").

## Decisões e limites conhecidos

| Decisão | Motivo | Limite |
| --- | --- | --- |
| Outbox + publisher confirms | Não perder evento entre o banco e o broker | O publicador faz polling; há latência de alguns segundos |
| Idempotência por `id_evento` na mesma transação | Duplicação não duplica efeito | A tabela `eventos_processados` cresce sem expurgo |
| `sequencia` por consulta | Eventos fora de ordem não reativam programação antiga | Eventos anteriores à US-11 não têm sequência e são aplicados sem checagem |
| Autorização conferida antes de cada tentativa | Sem registro, não há envio (LGPD) | Uma revogação no meio da chamada não impede aquele envio |
| Incerto não repete sozinho | Repetir pode duplicar a mensagem ao paciente | Depende de uma pessoa conferir e decidir (US-15) |
| Destinos de teste no modo real | O protótipo usa dados fictícios | O envio real ainda não foi verificado com um aparelho (IM-04) |
| Fuso America/Recife (UTC−3 fixo) | Sem horário de verão desde 2019 | Mudança legal de fuso exigiria revisão |

As propostas de evolução (iClinic, check-in, PEP, acesso e indicadores: US-25 a US-36) estão fora do escopo desta fase.
