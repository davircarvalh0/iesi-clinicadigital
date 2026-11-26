import { Router } from 'express';
import { esquemaFiltroPainel, listarPainel } from './painel';
import { listarLembretes } from './servico';
import { esquemaIdConsulta, trilhaDoLembrete } from './trilha';
import { resolverEnvioIncerto } from './resolucao';

export const rotasLembretes = Router();

// GET /lembretes?consulta=<id_consulta>
rotasLembretes.get('/', async (req, res) => {
  const idConsulta = typeof req.query.consulta === 'string' ? req.query.consulta : undefined;
  res.json(await listarLembretes({ idConsulta }));
});

// US-09: GET /lembretes/painel?situacao=falhou,bloqueado&de=AAAA-MM-DD&ate=AAAA-MM-DD&pagina=1&tamanhoPagina=20
rotasLembretes.get('/painel', async (req, res) => {
  res.json(await listarPainel(esquemaFiltroPainel.parse(req.query)));
});

// US-13: GET /lembretes/:idConsulta/trilha
rotasLembretes.get('/:idConsulta/trilha', async (req, res) => {
  res.json(await trilhaDoLembrete(esquemaIdConsulta.parse(req.params.idConsulta)));
});

// US-15: POST /lembretes/:idConsulta/resolucao  { acao: 'reenviar' | 'manter_sem_reenvio', solicitante }
rotasLembretes.post('/:idConsulta/resolucao', async (req, res) => {
  res.status(201).json(await resolverEnvioIncerto(esquemaIdConsulta.parse(req.params.idConsulta), { acao: req.body?.acao, solicitante: res.locals.usuario.nome }, new Date(), res.locals.usuario.id));
});
