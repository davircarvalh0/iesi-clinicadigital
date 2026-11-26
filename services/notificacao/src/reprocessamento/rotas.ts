import { Router } from 'express';
import { z } from 'zod';
import { inspecionar, listarReprocessamentos, reprocessar } from './servico';

// Rotas operacionais da fila de erros. Só existem quando OPERACAO_HABILITADA=true (ambiente de demonstração).
export const rotasOperacao = Router();

const mensagemLimite = 'Limite inválido. Informe um inteiro a partir de 1.';
const esquemaLimite = z.object({
  limite: z.coerce.number(mensagemLimite).int(mensagemLimite).min(1, mensagemLimite)
    .transform((v) => Math.min(v, 100)).default(50),
});
const esquemaFiltro = esquemaLimite.extend({ idEvento: z.string().trim().min(1).max(100).optional() });
const esquemaIdEvento = z.string('Informe o id do evento.').trim().min(1, 'Informe o id do evento.').max(100, 'Id do evento inválido.');
const esquemaSolicitacao = z.object({
  solicitante: z.string('Informe quem solicita o reprocessamento.').trim()
    .min(3, 'Solicitante deve ter ao menos 3 caracteres.').max(80, 'Solicitante deve ter no máximo 80 caracteres.'),
});

// GET /operacao/erros?limite=50 — mensagens da fila de erros, sem o payload.
rotasOperacao.get('/erros', async (req, res) => {
  const { limite } = esquemaLimite.parse(req.query);
  res.json(await inspecionar(limite));
});

// POST /operacao/erros/:idEvento/reprocessar { "solicitante": "..." }
rotasOperacao.post('/erros/:idEvento/reprocessar', async (req, res) => {
  const idEvento = esquemaIdEvento.parse(req.params.idEvento);
  const { solicitante } = esquemaSolicitacao.parse(req.body);
  res.status(202).json(await reprocessar(idEvento, solicitante));
});

// GET /operacao/reprocessamentos?limite=50&idEvento=<id>
rotasOperacao.get('/reprocessamentos', async (req, res) => {
  const { limite, idEvento } = esquemaFiltro.parse(req.query);
  res.json(await listarReprocessamentos(limite, idEvento));
});
