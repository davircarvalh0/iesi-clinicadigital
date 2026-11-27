import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { permitir, usuarioDe } from '../http/acesso';
import { ErroHttp } from '../http/erros';
import { esquemaHorarios, horariosDisponiveis } from './horarios';
import { confirmarPeloPaciente, esquemaSolicitacao, minhasConsultas, paraPaciente, solicitar } from './portal';
import * as servico from './servico';
import { esquemaNovaConsulta, esquemaRemarcacao } from './validacao';

export const rotasConsultas = Router();
const equipe = permitir('administrador', 'recepcionista');
const id = (valor: unknown) => String(valor);

rotasConsultas.get('/', permitir('administrador', 'recepcionista', 'profissional'), async (_req, res) => {
  const usuario = usuarioDe(res);
  res.json(await servico.listarConsultas(usuario.perfil === 'profissional' ? usuario.profissionalId! : undefined));
});

// Rotas fixas antes de '/:id' para não serem lidas como identificador.
rotasConsultas.get('/horarios-disponiveis', permitir('administrador', 'recepcionista', 'paciente'), async (req, res) => {
  res.json(await horariosDisponiveis(esquemaHorarios.parse(req.query)));
});

rotasConsultas.post('/solicitar', permitir('paciente'), async (req, res) => {
  res.status(201).json(await solicitar(usuarioDe(res).pacienteId!, esquemaSolicitacao.parse(req.body)));
});

rotasConsultas.post('/', equipe, async (req, res) => {
  const consulta = await servico.agendar(esquemaNovaConsulta.parse(req.body));
  res.status(201).json(consulta);
});

/** US-29: detalhe. Profissional e paciente só veem as próprias (as demais respondem 404). */
rotasConsultas.get('/:id', async (req, res) => {
  const usuario = usuarioDe(res);
  const consulta = await prisma.consulta.findUnique({ where: { id: id(req.params.id) } });
  const visivel = consulta && (usuario.perfil === 'administrador' || usuario.perfil === 'recepcionista'
    || (usuario.perfil === 'profissional' && consulta.profissionalId === usuario.profissionalId)
    || (usuario.perfil === 'paciente' && !consulta.vinculoPacientePendente && consulta.idPaciente === usuario.pacienteId));
  if (!visivel) throw new ErroHttp(404, 'Consulta não encontrada');
  res.json(usuario.perfil === 'paciente' ? paraPaciente(consulta) : consulta);
});

rotasConsultas.patch('/:id', equipe, async (req, res) => {
  res.json(await servico.remarcar(id(req.params.id), esquemaRemarcacao.parse(req.body)));
});

/** US-28: confirmada (equipe), concluida ou falta (equipe ou o profissional da consulta). */
const esquemaSituacao = z.object({ status: z.enum(['confirmada', 'concluida', 'falta'], 'Situação inválida. Use confirmada, concluida ou falta.') }).strict();
rotasConsultas.patch('/:id/status', permitir('administrador', 'recepcionista', 'profissional'), async (req, res) => {
  const { status } = esquemaSituacao.parse(req.body);
  const usuario = usuarioDe(res);
  if (usuario.perfil === 'profissional') {
    const consulta = await prisma.consulta.findUnique({ where: { id: id(req.params.id) }, select: { profissionalId: true } });
    if (!consulta || consulta.profissionalId !== usuario.profissionalId) throw new ErroHttp(404, 'Consulta não encontrada');
    if (status === 'confirmada') throw new ErroHttp(403, 'A confirmação é feita pela recepção ou pelo paciente.');
  }
  res.json(await servico.mudarSituacao(id(req.params.id), status));
});

rotasConsultas.patch('/:id/confirmar', permitir('paciente'), async (req, res) => {
  res.json(await confirmarPeloPaciente(usuarioDe(res).pacienteId!, id(req.params.id)));
});

rotasConsultas.delete('/:id', equipe, async (req, res) => {
  res.json(await servico.cancelar(id(req.params.id)));
});

/** US-27: consultas do paciente logado (`/pacientes/minha-conta/consultas`). */
export const rotasPortal = Router();
rotasPortal.get('/minha-conta/consultas', permitir('paciente'), async (_req, res) => {
  res.json(await minhasConsultas(usuarioDe(res).pacienteId!));
});
