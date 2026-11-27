# Recepção (front-end)

Tela da Clínica Digital: React 19 + TypeScript + Vite, com React Router e TanStack Query.
Conversa só com o gateway em `/api/<serviço>/…` (nginx no Docker, proxy do Vite em desenvolvimento).

```bash
npm run dev:recepcao                       # na raiz; http://localhost:5173 com os serviços nas portas 3001-3003
npm run typecheck -w @clinica/recepcao
npm test -w @clinica/recepcao              # regras de domínio (teste/)
```

## Telas por perfil

| Rota | Perfil | O que faz | Histórias |
| --- | --- | --- | --- |
| `/entrar` | todos | Login; a sessão dura o tempo do token (30 min) | acesso |
| `/agenda` | recepção, administração | Semana e dia escolhido; nova consulta com busca por CPF; remarcar; cancelar com confirmação; situação do lembrete e sincronização pendente | BL-07, US-08, US-12, US-18 |
| `/pacientes` | recepção, administração | Busca por nome ou CPF, paginada; cada pessoa aparece uma vez | US-07 |
| `/pacientes/:id` | recepção, administração | Dados e contato (com controle de revisão), autorizações por canal e histórico, consultas do paciente | US-02, US-14 |
| `/lembretes` | recepção, administração | Modo de envio explícito, filtros por período e situação, trilha de cada lembrete e decisão sobre envio sem confirmação | US-09, US-12, US-13, US-15 |
| `/minha-agenda` | profissional | Consultas do próprio profissional, só leitura | acesso |
| `/administracao/equipe` | administração | Profissionais e acessos ao sistema | acesso |
| `/administracao/operacao` | administração | Saúde dos serviços, fila de erros e reprocessamento | US-06 |

O botão **Integração ao vivo** (barra do topo) abre o painel com os eventos publicados pelo Agendamento e o que a
Notificação fez com eles. Para o administrador, o painel também traz os controles de demonstração (pausar a
Notificação e reenviar o último evento), que só existem com `TEST_CONTROLS=true`.

## Organização

```
src/
  app/          rotas por perfil, sessão, leitura periódica com frescor
  api/          cliente HTTP, contratos (tipos.ts) e chamadas por serviço
  dominio/      regras sem React: datas em America/Recife, CPF e telefone, frescor, lembretes, eventos
  layout/       estrutura (menu, barra de serviços) e painel Integração ao vivo
  telas/        uma pasta por tela
  ui/           componentes compartilhados (selo, aviso, diálogo, campo)
  estilos/      base (tokens), componentes e telas
teste/          testes das regras de domínio (node:test)
```

## Regras que a tela garante

- **Dado sem resposta não vira zero nem "ok".** Cada leitura tem um frescor: carregando, atual, atrasado,
  desatualizado (o serviço caiu e o dado é da última leitura) ou indisponível (situação desconhecida).
- **Falha incerta não é apresentada como feita nem como não feita.** Sem resposta do serviço (rede, prazo, 502-504),
  a tela pede para conferir antes de repetir; no cancelamento, confere sozinha com a próxima leitura da agenda.
- **Simulação nunca parece envio real.** O modo de envio fica no topo de Lembretes e em cada trilha.
- **CPF protegido** na apresentação (só os dígitos do meio) e nenhum CPF ou telefone no painel de eventos.
