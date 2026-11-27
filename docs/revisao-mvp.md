# Revisão do MVP após a PR #28

Base: af94aa7 (develop). Branch: fix/mvp-consistencia-seguranca.

## Alterações e critérios de aceite

| Área | Critério | Evidência |
| --- | --- | --- |
| Identidade | Sessão encerrada não autoriza requisições em qualquer dos três serviços. | US-25: logout e rejeição nos três serviços. |
| Cadastro | O portal não retorna nem confirma consulta com vínculo pendente. | Filtro aplicado na listagem, detalhe e confirmação. |
| Agenda | Reserva e limite de consultas concorrentes usam trava por paciente, além da trava por profissional. | US-26/27: execução em PostgreSQL pendente. |
| Agenda | Criar ou remarcar para o passado retorna 400. | Validação de entrada e fixture histórica separada da API. |
| WhatsApp | Resposta real exige contexto da mensagem original; confirmação deve corresponder à sequência da consulta. | US-30: simulação isolada e webhook sem contexto não confirma. Aceite real pendente. |
| Senha | Códigos de teste não são emitidos fora de ambiente isolado. | Recuperação desabilitada sem provedor; logs da CI sanitizados. |
| Interface | Exibe os cinco estados e não oferece edição de consulta encerrada. | Revisão do componente de consulta. |

## Decisões e limites

- Agendamento e Notificação validam a sessão pelo processo interno `cadastro-identidade` do domínio Cadastro, sem ler seu banco. A API cadastral e o consumidor podem parar sem interromper a agenda; se a identidade ou seu banco estiver indisponível, as rotas protegidas retornam 503. Avaliar OIDC/Keycloak conforme arquitetura original.
- Recuperação de senha usa o adaptador de e-mail Resend quando `RESEND_API_KEY` e `RECUPERACAO_REMETENTE` estão configurados. Sem provedor, retorna indisponibilidade; nenhum e-mail real é enviado durante a suíte.
- Respostas do WhatsApp sem referência ao lembrete original não alteram a consulta. Eventos anteriores sem sequência são descartados para evitar confirmações obsoletas.
- As alterações de landing page, cadastro público e migrations da árvore de trabalho local anterior não foram sobrescritas nem incorporadas automaticamente. Reconciliar estas migrations antes de atualizar banco já migrado.
- A numeração original do planejamento deve ser preservada e as novas histórias reidentificadas com aceite do PO.

## Definition of Done

Não declarar pronto sem build, typecheck, migrations e suíte completa no ambiente isolado, revisão independente e aceite. Não fazer deploy nem alterar registros existentes para resolver conflito de migration.
