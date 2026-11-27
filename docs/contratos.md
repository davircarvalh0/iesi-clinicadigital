# Contratos · eventos e HTTP

Referência única dos contratos desta versão. Os detalhes de cada regra estão no documento da história indicada.
Todas as rotas HTTP também ficam acessíveis pelo gateway da recepção, em `/api/<serviço>/…`.

## Eventos (RabbitMQ)

**Envelope** (`packages/eventos/src/envelope.ts`), comum a todos:

```json
{ "id_evento": "uuid", "tipo": "consulta.agendada", "versao": 1, "origem": "agendamento",
  "ocorrido_em": "2026-11-24T10:00:00.000-03:00", "id_correlacao": "consulta-uuid", "payload": { } }
```

A exchange `clinica.eventos` é do tipo `topic`, e a routing key é o `tipo` do evento. Versões aceitas: `VERSOES_SUPORTADAS`.
Um evento inválido é recusado antes do processamento e vai para a fila de erros do consumidor com `x-motivo` (US-04).

| Tipo | Origem | Payload | Consumidores (fila) | Histórias |
| --- | --- | --- | --- | --- |
| `consulta.agendada` | Agendamento | `id_consulta`, `paciente {cpf, nome, telefone}`, `profissional`, `especialidade`, `inicio`, `sequencia?` | Cadastro (`cadastro.consultas`), Notificação (`notificacao.consultas`) | US-01, US-10, US-11 |
| `consulta.reagendada` | Agendamento | idem | Notificação | US-10, US-11 |
| `consulta.cancelada` | Agendamento | idem | Notificação | US-11 |
| `paciente.atualizado` | Cadastro | `id_paciente`, `cpf`, `nome`, `telefone`, `email`, `revisao` | Agendamento (`agendamento.pacientes`), Notificação | US-01 a US-03 |
| `paciente.autorizacao_alterada` | Cadastro | `id_paciente`, `cpf`, `canal`, `situacao`, `origem_registro`, `registrado_em`, `versao` | Notificação | US-14 |
| `consulta.confirmada` | Notificação | `id_consulta`, `canal: "whatsapp"`, `confirmada_em` (sem telefone nem texto) | Agendamento (`agendamento.pacientes`); a Notificação ignora o próprio | US-30 |

- `sequencia` é aditivo (US-11). Um evento sem esse campo é aplicado sem checagem de ordem.
- `revisao` (paciente) e `versao` (autorização) só substituem a projeção local quando são maiores que a guardada.
- Cada consumidor tem a própria fila de erros (`<fila>.erros`). Depois de 3 tentativas confirmadas, a mensagem é
  copiada para ela com `x-motivo` e `x-tentativas` (US-05).

## Agendamento (`:3001`, `/api/agendamento`)

| Método e rota | Contrato | Histórias |
| --- | --- | --- |
| `GET /saude` | `{ servico, status }` | — |
| `GET /consultas` | Lista de consultas com o vínculo ao paciente (`idPaciente`, `vinculoPacientePendente`) | BL-07, US-08 |
| `POST /consultas` | Corpo `{ idPaciente?, nome, cpf, telefone, profissional, especialidade, inicio }` → `201`. Grava a consulta e `consulta.agendada` na outbox | BL-01, US-08, US-17 |
| `PATCH /consultas/:id` | `{ inicio }` → `200`; incrementa `sequencia` e publica `consulta.reagendada` | BL-05, US-11 |
| `DELETE /consultas/:id` | `200`; `409` se já estiver cancelada; `404` se não existir | BL-05, US-18 |
| `GET /eventos?limite=` | Eventos da outbox para o painel da recepção (sem CPF nem telefone) | US-16, US-17 |
| `GET /consultas/:id` | Detalhe; profissional e paciente só as próprias (as demais `404`); o paciente recebe a versão reduzida | US-29 |
| `PATCH /consultas/:id/status` | `{ status: confirmada \| concluida \| falta }`; equipe, ou o profissional da consulta (exceto confirmar); `409` fora da transição | US-28 |
| `GET /consultas/horarios-disponiveis?profissionalId=&data=&dias=` | Grade livre (até 14 dias), sem ocupados nem passados; equipe e paciente | US-26 |
| `POST /consultas/solicitar` | Paciente: `{ profissionalId, inicio }` → `201`; só na grade, até 3 futuras; `409` em conflito | US-27 |
| `PATCH /consultas/:id/confirmar` | Paciente confirma a própria (idempotente) | US-27 |
| `GET /pacientes/minha-conta/consultas` | Consultas do paciente logado | US-27 |
| `GET /profissionais` · `POST /profissionais` | Lista (paciente: só ativos, campos reduzidos) e cadastro (administrador) | US-26 |
| `GET /profissionais/:id` · `PATCH /profissionais/:id` · `PATCH /profissionais/:id/status` | Detalhe (equipe ou o próprio), edição e `{ ativo }` (administrador) | US-26 |
| `GET /profissionais/:id/disponibilidade` · `PUT …/disponibilidade` | `{ duracaoConsultaMinutos?, intervalos: [{ diaSemana 0–6, inicio "HH:MM", fim }] }`; o PUT substitui a semana (administrador) | US-26 |
| `GET /indicadores/resumo?de=&ate=` · `GET /indicadores/consultas?de=&ate=` | Indicadores do período (padrão: mês corrente), só administrador | US-29 |

`POST /consultas` e `PATCH /consultas/:id` respondem `409` quando o horário se sobrepõe a outra consulta do mesmo
profissional ou o profissional está inativo (US-26). Remarcar uma consulta confirmada a devolve para `agendada` (US-28).
| `POST /demo/reenviar-ultimo-evento` | Republica o último `id_evento` (demonstração de duplicação) | BL-03 |

Uma entrada inválida responde `400 { erro }` com o motivo (US-17).

## Cadastro (`:3003`, `/api/cadastro`)

| Método e rota | Contrato | Histórias |
| --- | --- | --- |
| `GET /pacientes?busca=&pagina=&tamanhoPagina=` | Busca por nome ou CPF; traz o `total` do cadastro mestre e o `totalFiltrado` | US-07 |
| `POST /pacientes/busca-cpf` | `{ cpf }` → `{ paciente \| null }` | US-08 |
| `GET /pacientes/:id` | Detalhe com `canalPreferido` e a situação de `autorizacoes` por canal | US-02, US-14 |
| `PATCH /pacientes/:id` | Edição parcial com `revisao`; publica `paciente.atualizado` | US-02, US-03 |
| `GET /pacientes/:id/autorizacoes` | `{ historico }`, do mais recente para o mais antigo | US-14 |
| `POST /pacientes/:id/autorizacoes` | `{ canal, situacao, origem }` → `201`; `409` em registro simultâneo; publica `paciente.autorizacao_alterada` | US-14 |

Usuários (`/usuarios`). Sem login: `login`, `recuperar-senha`, `redefinir-senha`. Com sessão: `logout`, `minha-conta/*`.
O restante é só do administrador.

| Método e rota | Contrato | Histórias |
| --- | --- | --- |
| `POST /usuarios/login` | `{ email, senha }` → `{ usuario, token, expiraEm }`; abre uma sessão de 30 min; `403` com a conta desativada | US-25 |
| `POST /usuarios/logout` | Encerra a sessão do token → `204` | US-25 |
| `PATCH /usuarios/minha-conta/senha` | `{ senhaAtual, novaSenha }` → `204`; derruba as outras sessões | US-25 |
| `POST /usuarios/recuperar-senha` | `{ email }` → sempre `202`, com ou sem conta; código no log (envio simulado) | US-25 |
| `POST /usuarios/redefinir-senha` | `{ codigo, novaSenha }` → `204`; `400` com código inválido, expirado ou já usado | US-25 |
| `PATCH /usuarios/minha-conta` | `{ nome?, email?, telefone? }`; no paciente, nome e telefone atualizam o mestre e publicam `paciente.atualizado` | US-27 |
| `GET /usuarios` · `POST /usuarios` | Lista (administrador) e cria contas. A recepção cria só conta `paciente`, com `pacienteId` do mestre (uma por paciente) | Acesso, US-27 |
| `GET /usuarios/:id` | Conta sem a senha, com `ativo` | US-25 |
| `PATCH /usuarios/:id` | Parcial: `{ nome, email, perfil, profissionalId }`; `409` com e-mail repetido ou sem outro administrador ativo | US-25 |
| `PATCH /usuarios/:id/status` | `{ ativo }`; desativar encerra as sessões; `409` na própria conta ou no último administrador | US-25 |

## Notificação (`:3002`, `/api/notificacao`)

| Método e rota | Contrato | Histórias |
| --- | --- | --- |
| `GET /saude` | `{ servico, status }` | — |
| `GET /lembretes?consulta=` | Lembretes completos, usados pela agenda (polling) | US-10, US-12, US-18 |
| `GET /lembretes/painel?situacao=&de=&ate=&pagina=&tamanhoPagina=` | Listagem paginada com `contagem` por situação, sem CPF nem telefone | US-09 |
| `GET /lembretes/:idConsulta/trilha` | `{ lembrete, tentativas, atividades, resolucoes }` em ordem cronológica | US-13, US-15 |
| `POST /lembretes/:idConsulta/resolucao` | `{ acao: reenviar \| manter_sem_reenvio, solicitante }` → `201`; `409` fora da situação `incerto` | US-15 |
| `GET /envio/configuracao` | `{ modo, canal, motivo, destinosPermitidos, antecedenciaMinutos, modoAntecedencia, maxTentativas }` | US-15 |
| `GET /atividades?limite=` | Painel "Eventos em tempo real"; limite inteiro de 1 a 100 | US-16, US-17 |
| `GET /autorizacoes/:idPaciente` | Cópia local das autorizações (sem CPF) | US-14 |
| `GET /demo/consumo` · `PUT /demo/consumo` | Pausa e retoma o consumo (demonstração de indisponibilidade) | BL-03, US-18 |
| `GET /operacao/erros` · `POST /operacao/erros/:idEvento/reprocessar` · `GET /operacao/reprocessamentos` | Só com `OPERACAO_HABILITADA=true`: inspeção e reprocessamento da fila de erros | US-06 |

## Situações e resultados

| Lembrete (`status`) | Significado |
| --- | --- |
| `programado` | Aguarda o horário de envio |
| `enviando` | Reservado pela rotina durante a chamada ao canal |
| `simulado` · `aceito_provedor` | Envio concluído em log, ou aceito pelo WhatsApp com `idExterno` |
| `falhou` | Tentativas esgotadas, falha definitiva ou consulta já iniciada |
| `bloqueado` | Sem autorização de contato no canal |
| `incerto` | Sem confirmação do WhatsApp depois do pedido; aguarda a decisão da recepção |
| `cancelado` | Consulta cancelada antes do envio (terminal) |
| `enviado` | Registro anterior à US-12, sem classificação |

| Tentativa (`resultado`) | Significado |
| --- | --- |
| `em_andamento` | Registrada antes da chamada; ainda sem desfecho |
| `simulado` · `aceito_provedor` · `falhou` | Desfecho gravado |
| `indeterminado` | Sem resposta depois do pedido, ou processo interrompido durante a chamada |
