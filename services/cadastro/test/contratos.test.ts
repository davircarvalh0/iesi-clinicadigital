import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ehPacienteAtualizado } from '@clinica/eventos';
import { esquemaBusca, esquemaBuscaCpf, esquemaContato, esquemaPacienteAgendado } from '../src/validacao';
import { mascaraCpf, mascaraTelefone } from '../../../apps/recepcao/src/formatacao';

test('contato normaliza máscara, permite remover e-mail e protege identidade/revisão', () => {
  assert.deepEqual(esquemaContato.parse({ telefone: '(81) 90000-0001', email: '', revisao: 1 }), {
    telefone: '81900000001', email: null, revisao: 1,
  });
  for (const entrada of [
    { telefone: '123', email: null, revisao: 1 },
    { telefone: '81900000001', email: 'invalido', revisao: 1 },
    { telefone: '81900000001', email: null },
    { telefone: '81900000001', email: null, revisao: 1, cpf: '00000000000' },
  ]) assert.equal(esquemaContato.safeParse(entrada).success, false);
});

test('busca tem limites, paginação e não confunde CPF mascarado com nome', () => {
  assert.deepEqual(esquemaBusca.parse({}), { busca: '', pagina: 1, tamanhoPagina: 20 });
  for (const entrada of [{ pagina: 0 }, { tamanhoPagina: 101 }, { busca: 'a'.repeat(121) }]) {
    assert.equal(esquemaBusca.safeParse(entrada).success, false);
  }
  assert.equal(mascaraCpf('00012345678'), '000.123.456-78');
  assert.equal(mascaraTelefone('5581900000001'), '(81) 90000-0001');
  assert.equal(mascaraTelefone('8130000001'), '(81) 3000-0001');
});

test('busca exata por CPF aceita máscara ou dígitos e rejeita buscas parciais', () => {
  for (const cpf of ['000.123.456-78', '00012345678']) {
    assert.deepEqual(esquemaBuscaCpf.parse({ cpf }), { cpf: '00012345678' });
  }
  for (const cpf of ['000.123', 'abc00012345678', '000123456789', 12345678901]) {
    assert.equal(esquemaBuscaCpf.safeParse({ cpf }).success, false);
  }
});

test('contratos rejeitam versões desconhecidas e payloads incompletos', () => {
  const evento = { id_evento: 'teste', tipo: 'paciente.atualizado', versao: 1, origem: 'cadastro',
    id_correlacao: 'paciente-teste', ocorrido_em: '2026-11-07T12:00:00-03:00',
    payload: { id_paciente: 'teste', cpf: '00012345678', nome: 'Paciente Fictício', telefone: '81900000001', email: null, revisao: 2 } };
  assert.equal(ehPacienteAtualizado(evento), true);
  for (const invalido of [{ ...evento, versao: 2 }, { ...evento, payload: {} }, { ...evento, ocorrido_em: 'ontem' }]) {
    assert.equal(ehPacienteAtualizado(invalido), false);
  }
  assert.equal(esquemaPacienteAgendado.safeParse({ tipo: 'consulta.agendada', versao: 2 }).success, false);
});
