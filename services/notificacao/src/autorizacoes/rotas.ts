import { Router } from 'express';
import { copiaDoPaciente } from './servico';

export const rotasAutorizacoes = Router();

// GET /autorizacoes/:idPaciente: a cópia que a Notificação usa no envio (sem CPF nem contato).
rotasAutorizacoes.get('/:idPaciente', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await copiaDoPaciente(req.params.idPaciente));
});
