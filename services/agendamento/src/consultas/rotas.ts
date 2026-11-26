import { Router } from 'express';
import * as servico from './servico';
import { esquemaNovaConsulta, esquemaRemarcacao } from './validacao';

export const rotasConsultas = Router();

rotasConsultas.get('/', async (_req, res) => {
  const usuario = res.locals.usuario;
  res.json(await servico.listarConsultas(usuario?.perfil === 'profissional' ? usuario.profissionalId : undefined));
});

rotasConsultas.post('/', async (req, res) => {
  const consulta = await servico.agendar(esquemaNovaConsulta.parse(req.body));
  res.status(201).json(consulta);
});

rotasConsultas.patch('/:id', async (req, res) => {
  res.json(await servico.remarcar(req.params.id, esquemaRemarcacao.parse(req.body)));
});

rotasConsultas.delete('/:id', async (req, res) => {
  res.json(await servico.cancelar(req.params.id));
});
