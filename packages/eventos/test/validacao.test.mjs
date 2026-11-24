import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criarEnvelope, validarEventoConsulta, validarPacienteAtualizado } from '../dist/index.js';

// Só dados fictícios.
const consulta = (alteracoes = {}) => ({
  ...criarEnvelope({
    tipo: 'consulta.agendada',
    origem: 'agendamento',
    id_correlacao: 'consulta-c1',
    payload: {
      id_consulta: 'c1',
      paciente: { cpf: '00011122233', nome: 'Paciente Fictício', telefone: '81900000001' },
      profissional: 'Profissional Fictício',
      especialidade: 'Teste',
      inicio: '2026-12-01T09:00:00.000Z',
    },
  }),
  ...alteracoes,
});

const paciente = (alteracoes = {}) => ({
  ...criarEnvelope({
    tipo: 'paciente.atualizado',
    origem: 'cadastro',
    id_correlacao: 'paciente-p1',
    payload: { id_paciente: 'p1', cpf: '00011122233', nome: 'Paciente Fictício', telefone: '81900000001', email: null, revisao: 2 },
  }),
  ...alteracoes,
});

const comPayload = (base, payload) => ({ ...base, payload: { ...base.payload, ...payload } });

test('US-04 CA1: envelope incompleto é recusado com motivo', () => {
  const casos = [
    [null, 'mensagem não é um objeto JSON'],
    [consulta({ id_evento: '' }), 'id_evento ausente'],
    [consulta({ tipo: 'consulta.desconhecida' }), 'tipo não suportado: consulta.desconhecida'],
    [consulta({ origem: 'cadastro' }), 'origem inesperada para consulta.agendada'],
    [consulta({ id_correlacao: undefined }), 'id_correlacao ausente'],
    [consulta({ ocorrido_em: 'ontem' }), 'ocorrido_em inválido'],
    [consulta({ payload: undefined }), 'payload ausente'],
  ];
  for (const [evento, motivo] of casos) {
    assert.deepEqual(validarEventoConsulta(evento), { ok: false, motivo });
  }
});

test('US-04 CA1: payload de consulta incompleto ou com data inválida é recusado', () => {
  const base = consulta();
  const casos = [
    [comPayload(base, { id_consulta: '' }), 'payload.id_consulta ausente'],
    [comPayload(base, { paciente: undefined }), 'payload.paciente ausente'],
    [comPayload(base, { paciente: { ...base.payload.paciente, cpf: '123' } }), 'payload.paciente.cpf inválido'],
    [comPayload(base, { paciente: { ...base.payload.paciente, nome: 'A' } }), 'payload.paciente.nome inválido'],
    [comPayload(base, { paciente: { ...base.payload.paciente, telefone: 'abc' } }), 'payload.paciente.telefone inválido'],
    [comPayload(base, { profissional: ' ' }), 'payload.profissional ausente'],
    [comPayload(base, { especialidade: undefined }), 'payload.especialidade ausente'],
    [comPayload(base, { inicio: '31/02/2026' }), 'payload.inicio inválido'],
  ];
  for (const [evento, motivo] of casos) {
    assert.deepEqual(validarEventoConsulta(evento), { ok: false, motivo });
  }
});

test('US-04 CA2: campos aditivos são aceitos; versão incompatível tem motivo explícito', () => {
  const aditivo = { ...consulta({ campo_novo: true }), payload: { ...consulta().payload, sala: '3' } };
  assert.equal(validarEventoConsulta(aditivo).ok, true);
  assert.equal(validarEventoConsulta(consulta()).ok, true);
  assert.deepEqual(validarEventoConsulta(consulta({ versao: 2 })), {
    ok: false, motivo: 'versão 2 não suportada para consulta.agendada',
  });
  assert.deepEqual(validarPacienteAtualizado(paciente({ versao: 2 })), {
    ok: false, motivo: 'versão 2 não suportada para paciente.atualizado',
  });
});

test('US-04: paciente.atualizado mantém as regras anteriores', () => {
  assert.equal(validarPacienteAtualizado(paciente()).ok, true);
  assert.equal(validarPacienteAtualizado(comPayload(paciente(), { email: 'teste@exemplo.com' })).ok, true);
  assert.deepEqual(validarPacienteAtualizado(comPayload(paciente(), { revisao: 0 })), { ok: false, motivo: 'payload.revisao inválida' });
  assert.deepEqual(validarPacienteAtualizado(comPayload(paciente(), { email: 1 })), { ok: false, motivo: 'payload.email inválido' });
  assert.deepEqual(validarPacienteAtualizado(consulta()), { ok: false, motivo: 'tipo não suportado: consulta.agendada' });
});

test('US-04 CA3: motivos não carregam dados pessoais do evento', () => {
  const sentinela = comPayload(consulta(), { paciente: { cpf: '99988877766', nome: 'X', telefone: '81988887777' } });
  const resultado = validarEventoConsulta(sentinela);
  assert.equal(resultado.ok, false);
  assert.doesNotMatch(resultado.motivo, /99988877766|81988887777/);
});