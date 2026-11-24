import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  aplicarAcao, conferirCancelamento, pendenciaDoLembrete, situacaoDe, type AcaoCancelamento,
} from '../src/sincronizacao';
import type { Consulta, Lembrete } from '../src/tipos';

const INICIO = '2026-12-01T13:00:00.000Z';
const consulta = (dados: Partial<Consulta> = {}): Consulta => ({
  id: 'c1', idPaciente: null, vinculoPacientePendente: false, pacienteNome: 'Paciente Fictício',
  pacienteCpf: '00000000000', pacienteTelefone: '81900000000', profissional: 'Profissional Fictício',
  especialidade: 'Teste', inicio: INICIO, status: 'agendada', ...dados,
});
const lembrete = (dados: Partial<Lembrete> = {}): Lembrete => ({
  id: 'l1', idConsulta: 'c1', status: 'programado', inicioConsulta: INICIO,
  enviarEm: '2026-11-30T13:00:00.000Z', enviadoEm: null, motivoFalha: null, ...dados,
});

describe('situacaoDe (US-18-T2)', () => {
  const AGORA = 100_000;
  const LIMITE = 6000;
  test('sem resposta ainda: carregando', () => {
    assert.equal(situacaoDe({ erro: null, atualizadoEm: null }, AGORA, LIMITE), 'carregando');
  });
  test('falha sem nunca ter respondido: indisponível (situação desconhecida)', () => {
    assert.equal(situacaoDe({ erro: new Error('x'), atualizadoEm: null }, AGORA, LIMITE), 'indisponivel');
  });
  test('falha depois de ter respondido: desatualizado, mesmo com resposta recente', () => {
    assert.equal(situacaoDe({ dados: [], erro: new Error('x'), atualizadoEm: AGORA - 10 }, AGORA, LIMITE), 'desatualizado');
  });
  test('resposta recente: atualizado', () => {
    assert.equal(situacaoDe({ dados: [], erro: null, atualizadoEm: AGORA - LIMITE }, AGORA, LIMITE), 'atualizado');
  });
  test('sem erro, mas sem resposta nova além do limite (latência): atrasado', () => {
    assert.equal(situacaoDe({ dados: [], erro: null, atualizadoEm: AGORA - LIMITE - 1 }, AGORA, LIMITE), 'atrasado');
  });
});

describe('pendenciaDoLembrete (US-18 CA3)', () => {
  test('consulta agendada sem lembrete: programação pendente', () => {
    assert.equal(pendenciaDoLembrete(consulta(), undefined), 'programacao');
  });
  test('lembrete com o mesmo início: sincronizado', () => {
    assert.equal(pendenciaDoLembrete(consulta(), lembrete()), null);
  });
  test('mesmo instante em formatos diferentes não é pendência', () => {
    assert.equal(pendenciaDoLembrete(consulta({ inicio: '2026-12-01T10:00:00-03:00' }), lembrete()), null);
  });
  test('remarcada na agenda, lembrete com o início anterior: remarcação pendente', () => {
    assert.equal(pendenciaDoLembrete(consulta({ inicio: '2026-12-02T13:00:00.000Z' }), lembrete()), 'remarcacao');
  });
  test('sem inicioConsulta na resposta, não inventa pendência de remarcação', () => {
    assert.equal(pendenciaDoLembrete(consulta({ inicio: '2026-12-02T13:00:00.000Z' }), lembrete({ inicioConsulta: undefined })), null);
  });
  for (const status of ['programado', 'falhou'] as const) {
    test(`cancelada com lembrete ${status}: cancelamento pendente`, () => {
      assert.equal(pendenciaDoLembrete(consulta({ status: 'cancelada' }), lembrete({ status })), 'cancelamento');
    });
  }
  for (const status of ['cancelado', 'enviado'] as const) {
    test(`cancelada com lembrete ${status}: nada pendente`, () => {
      assert.equal(pendenciaDoLembrete(consulta({ status: 'cancelada' }), lembrete({ status })), null);
    });
  }
  test('cancelada sem lembrete: nada a cancelar', () => {
    assert.equal(pendenciaDoLembrete(consulta({ status: 'cancelada' }), undefined), null);
  });
});

describe('conferirCancelamento e aplicarAcao (US-18 CA1)', () => {
  const incerta: AcaoCancelamento = { fase: 'incerta', mensagem: 'sem resposta', em: 1000 };

  test('incerto continua incerto enquanto não houver agenda lida depois da falha', () => {
    assert.deepEqual(conferirCancelamento(incerta, consulta({ status: 'cancelada' }), 1000), incerta);
    assert.deepEqual(conferirCancelamento(incerta, consulta({ status: 'cancelada' }), null), incerta);
  });
  test('agenda posterior mostra cancelada: confirmado pela agenda', () => {
    const r = conferirCancelamento(incerta, consulta({ status: 'cancelada' }), 1001);
    assert.equal(r.fase, 'confirmada');
    assert.match((r as { observacao?: string }).observacao ?? '', /agenda atualizada/);
  });
  test('agenda posterior mostra agendada: não confirmado, nunca "cancelado"', () => {
    const r = conferirCancelamento(incerta, consulta(), 1001);
    assert.equal(r.fase, 'falhou');
    assert.match((r as { mensagem: string }).mensagem, /não confirmado/);
  });
  test('falha e envio não são alterados pela agenda', () => {
    const falhou: AcaoCancelamento = { fase: 'falhou', mensagem: 'x' };
    assert.equal(conferirCancelamento(falhou, consulta({ status: 'cancelada' }), 5000), falhou);
  });
  test('só uma confirmação do Agendamento muda o status exibido', () => {
    assert.equal(aplicarAcao(consulta(), { fase: 'confirmada', em: 1 }).status, 'cancelada');
    assert.equal(aplicarAcao(consulta(), { fase: 'falhou', mensagem: 'x' }).status, 'agendada');
    assert.equal(aplicarAcao(consulta(), incerta).status, 'agendada');
    assert.equal(aplicarAcao(consulta(), { fase: 'enviando' }).status, 'agendada');
    assert.equal(aplicarAcao(consulta(), undefined).status, 'agendada');
  });
});
