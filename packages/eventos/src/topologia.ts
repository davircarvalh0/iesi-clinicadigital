// Nomes do barramento. A mesma topologia está declarada em infra/rabbitmq/definitions.json,
// para que as filas existam mesmo antes de o consumidor subir.

/** Exchange de tópicos onde todos os serviços publicam seus fatos. A routing key é o `tipo` do evento. */
export const EXCHANGE_EVENTOS = 'clinica.eventos';

/** Exchange para onde vão as mensagens rejeitadas em definitivo. */
export const EXCHANGE_ERROS = 'clinica.eventos.erros';

export const FILA_NOTIFICACAO = 'notificacao.consultas';
export const FILA_NOTIFICACAO_ERROS = 'notificacao.consultas.erros';
export const BINDING_NOTIFICACAO = 'consulta.*';
