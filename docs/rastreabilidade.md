# Rastreabilidade · história → evidência → comando

Situação em 24/11/2026, na branch `feat/us-24-defesa`, que contém todas as anteriores. "Implementada" quer dizer que há
código e testes aprovados, não que a história foi aceita: o aceite do PO e a revisão cruzada continuam pendentes para
todas. Comandos de banco: defina `TEST_DATABASE_URL` (Notificação) ou `DATABASE_URL` + `TEST_USNN_DB=1` (Cadastro),
apontando para um banco de teste com as migrações aplicadas. `npm run verificar` faz tudo isso sozinho.

| História | Documento | Testes de unidade / banco | Integração (Compose) | Situação |
| --- | --- | --- | --- | --- |
| US-01 Paciente mestre | [US-01](US-01.md) | `cadastro/test/contratos.test.ts`, `test:us01:db -w @clinica/cadastro` | `test:us01:reinicio` | Implementada (develop) |
| US-02 Manter cadastro | [US-02](US-02.md) | `test:us02:api -w @clinica/cadastro` | `test:integracao` (US-07) | Implementada (develop) |
| US-03 Propagar cadastro | [US-03](US-03.md) | — | `test:us03` | Implementada (develop) |
| US-04 Recusar eventos incompatíveis | [US-04](US-04.md) | `packages/eventos/test/validacao.test.mjs` | `test:us04` | Implementada (develop) |
| US-05 Preservar mensagens | [US-05](US-05.md) | — | `test:us05` | Implementada (develop) |
| US-06 Fila de erros | [US-06](US-06.md) | `notificacao/test/us06*.test.ts` | `test:us06` | Implementada (integração; estava só no `main`) |
| US-07 Pacientes | [US-07](US-07.md) | recepção: `telas.test.tsx` | `test:integracao` | Implementada (develop) |
| US-08 Reutilizar paciente | [US-08](US-08.md) | — | `test:us08` | Implementada (develop) |
| US-09 Lista de lembretes | [US-09](US-09.md) | `test:us09 -w @clinica/notificacao`, recepção: `lembretes.test.tsx` | `test:us09` | **Implementada nesta entrega** |
| US-10 Antecedência | [US-10](US-10.md) | `test:us10 -w @clinica/notificacao` | (fluxo coberto por US-13/14/16) | Implementada (develop) |
| US-11 Envio obsoleto | [US-11](US-11.md) | `test:us11 -w @clinica/notificacao` | `test:us11` | Implementada (integração; testes de banco executados pela primeira vez) |
| US-12 Resultado do envio | [US-12](US-12.md) | `test:us12 -w @clinica/notificacao` | (fluxo coberto por US-13/14/16) | Implementada (develop) |
| US-13 Trilha das tentativas | [US-13](US-13.md) | `test:us13 -w @clinica/notificacao`, recepção: `lembretes.test.tsx` | `test:us13` | **Implementada nesta entrega** |
| US-14 Autorização de contato | [US-14](US-14.md) | `test:us14:db -w @clinica/cadastro`, `test:us14 -w @clinica/notificacao` | `test:us14` | Implementada (develop); verificação no envio **restaurada** |
| US-15 Envio real controlado e incerto | [US-15](US-15.md) | `test:us15 -w @clinica/notificacao`, recepção: `lembretes.test.tsx` | `test:us15` | **Implementada nesta entrega**; envio real com aparelho pendente (IM-04) |
| US-16 Minimizar dados pessoais | [US-16](US-16.md) | — | `test:us16` | Implementada (develop) |
| US-17 Erros previsíveis | [US-17](US-17.md) | `agendamento/test/us17.test.ts`, `notificacao/test/us17.test.ts` | `test:us17` | Implementada (integração) |
| US-18 Falhas e sincronização | [US-18](US-18.md) | recepção: `sincronizacao`, `falhas`, `filaRecarga`, `telas` | `test:us18` | Implementada (develop) |
| US-19 Ambiente limpo | [US-19](US-19.md) | `test:us19` | `npm run ambiente:limpo` | Implementada (develop) |
| US-20 Verificação reproduzível | [US-20](US-20.md) | `test:scripts` | `npm run verificar` | **Implementada nesta entrega** |
| US-21 CI | [US-21](US-21.md) | — | `.github/workflows/verificacao.yml` | **Implementada nesta entrega**; sem execução no GitHub ainda |
| US-22 Validação humana | [US-22](US-22.md) | — | — | **Material pronto; sessão pendente** (IM-02) |
| US-23 Documentação | [US-23](US-23.md) | — | — | **Implementada nesta entrega** |
| US-24 Defesa | [US-24](US-24.md) | — | `npm run demo:ensaio` | **Roteiro e ensaio prontos; ensaio humano pendente** |

## Base encontrada no código (BL)

| Item | Evidência automatizada |
| --- | --- |
| BL-01 Consulta e outbox na mesma transação | `test:us01:reinicio`, ensaio (passo 1) |
| BL-02 Publicação com confirmação | `test:us05` |
| BL-03 Deduplicação por `id_evento` | ensaio (passo 3), `test:us03` |
| BL-04 Antecedência de 24 h | `test:us10` |
| BL-05 Remarcar e cancelar por eventos | ensaio (passo 2), `test:us11` |
| BL-06 Adaptador WhatsApp ou log | `test:us12`, `test:us15` |
| BL-07 Agenda React integrada | recepção (`npm test -w @clinica/recepcao`), `test:us18` |
| BL-08 Compose com bancos separados | `npm run ambiente:limpo`, `npm run verificar` |

## Resultados demonstráveis do Product Goal

| Resultado | Evidência |
| --- | --- |
| Consulta gera vínculo mestre e programação | `npm run demo:ensaio` (1), `test:us08`, `test:us13` |
| Remarcação e cancelamento se propagam | `demo:ensaio` (2), `test:us11`, `test:us16` |
| Duplicação não duplica efeito | `demo:ensaio` (3), `test:us03`, `test:us01:db` |
| Indisponibilidade recupera processamento | `demo:ensaio` (4), `test:us18`, `test:us05`, `test:us01:reinicio` |
| Modo de envio explícito | `demo:ensaio` (5), `test:us12`, `test:us15` |
