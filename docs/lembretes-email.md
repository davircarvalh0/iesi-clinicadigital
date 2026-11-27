# Lembretes por e-mail

O serviço de Notificação envia lembretes automaticamente pelo Resend. O Cadastro continua sendo o mestre do contato: o evento existente `paciente.atualizado` já fornece e-mail e revisão. A Notificação mantém essa projeção, sem incluir o endereço na resposta do painel ou na trilha de tentativas.

## Configuração

No `.env`, use `CANAL_ENVIO=email_log` para simular e-mail, mesmo quando houver credenciais de recuperação de senha. Para envio real:

```dotenv
CANAL_ENVIO=email
RESEND_API_KEY=
LEMBRETE_EMAIL_REMETENTE=
LEMBRETE_EMAIL_DESTINOS_PERMITIDOS=
```

Preencha a chave do Resend e um remetente autorizado pelo provedor. A lista aceita endereços separados por vírgula; vazia bloqueia envio real. Use somente destinos de teste durante a validação. O valor `*` libera todos os endereços autorizados e deve ser reservado a ambiente de operação. Sem credenciais, o canal simula; não confundir simulação com entrega.

Em banco existente, primeiro configure `ENVIO_AUTOMATICO_HABILITADO=false`, suba com as migrations e republique a projeção de contatos pelo comando `docker compose exec cadastro node dist/republicar-contatos.js`. A operação preserva os dados, incrementa as revisões e publica os eventos pela outbox existente. Aguarde o processamento antes de reativar o envio com `ENVIO_AUTOMATICO_HABILITADO=true` e recriar a Notificação. Assim os lembretes pendentes não são consumidos em simulação durante a atualização. Cadastros sem endereço válido não recebem mensagem. O consentimento de WhatsApp não autoriza e-mail.

## Contratos e desfechos

- `GET /envio/configuracao`: canal `email`, modo `real` ou `simulado`, quantidade de destinos e regras de antecedência/tentativas.
- `GET /lembretes/painel` e `GET /lembretes/:idConsulta/trilha`: `canalEnvio`/ `canal` podem valer `email`; identificador do Resend indica aceite, não entrega nem leitura.
- `POST /lembretes/:idConsulta/resolucao`: mantém o fluxo de decisão humana para resultado incerto; reenvio exige autorização atual.
- Respostas definitivas não são repetidas. HTTP 429 permite nova tentativa; resposta ausente, 5xx ou aceite sem identificador são incertos.
- O conteúdo é texto simples com nome do paciente, profissional e data/hora no fuso da clínica. Credenciais, destinatários e corpo da resposta do provedor não são registrados nos logs.

O frontend não foi alterado nesta entrega: sua identificação visual de canais ainda precisa ser adaptada.

## Validação

`npm test -w @clinica/notificacao` executa os testes do adaptador, simulação e, com `TEST_DATABASE_URL` apontando para um banco de teste migrado, a prova de autorização e persistência. `npm run verificar` executa as suítes integradas. O teste automatizado usa um provedor fictício e não dispara mensagens reais.
