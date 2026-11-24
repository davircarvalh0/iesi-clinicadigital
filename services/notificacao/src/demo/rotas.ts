import { Router } from 'express';
import { z } from 'zod';
import { registrarAtividade } from '../atividades/registro';
import { estadoConsumo, pausarConsumo, retomarConsumo } from '../consumidor/consumidor';

// Rotas do "modo demonstração" da tela: simulam a Notificação fora do ar
// sem derrubar o processo (o consumidor para de ler a fila; a API continua respondendo).
export const rotasDemo = Router();

rotasDemo.get('/consumo', async (_req, res) => {
  res.json(await estadoConsumo());
});

rotasDemo.put('/consumo', async (req, res) => {
  const { ativo } = z.object({ ativo: z.boolean() }).parse(req.body);
  const antes = await estadoConsumo();

  if (ativo && !antes.consumindo) {
    await retomarConsumo();
    await registrarAtividade({
      acao: 'consumo.retomado',
      descricao: antes.naFila
        ? `Serviço de volta; processando ${antes.naFila} evento(s) que esperavam na fila`
        : 'Serviço de volta ao ar',
    });
  } else if (!ativo && antes.consumindo) {
    await pausarConsumo();
    await registrarAtividade({ acao: 'consumo.pausado', descricao: 'Serviço fora do ar; novos eventos vão esperar na fila' });
  }
  res.json(await estadoConsumo());
});
