import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { validarConsultaConfirmada, criarEnvelope } from '@clinica/eventos';
import { assinaturaValida, extrairRespostas } from '../src/confirmacoes/rotas';
import { ehConfirmacao } from '../src/confirmacoes/servico';

test('US-30: respostas que confirmam presença', () => {
  for (const t of ['1', 'Sim', 'SIM!', ' confirmo ', 'Confirmado.', 'ok', 'CONFIRMAR_PRESENCA', 'estarei lá']) assert.equal(ehConfirmacao(t), true, t);
  for (const t of ['2', 'não', 'nao vou', 'quero remarcar', 'sim, mas posso remarcar?', '']) assert.equal(ehConfirmacao(t), false, t);
});

test('US-30: assinatura X-Hub-Signature-256 confere o corpo exato', () => {
  const corpo = Buffer.from('{"entry":[]}');
  const assinatura = `sha256=${createHmac('sha256', 'segredo').update(corpo).digest('hex')}`;
  assert.equal(assinaturaValida(corpo, assinatura, 'segredo'), true);
  assert.equal(assinaturaValida(corpo, assinatura, 'outro'), false);
  assert.equal(assinaturaValida(Buffer.from('{"entry":[ ]}'), assinatura, 'segredo'), false, 'corpo alterado');
  assert.equal(assinaturaValida(corpo, undefined, 'segredo'), false);
  assert.equal(assinaturaValida(corpo, 'sha256=abc', 'segredo'), false);
});

test('US-30: extrai texto, botão e resposta interativa do webhook da Meta', () => {
  const corpo = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
    statuses: [{ id: 'status-ignorado' }],
    messages: [
      { id: 'w1', from: '5581900000001', timestamp: '1767000000', type: 'text', text: { body: 'Sim' } },
      { id: 'w2', from: '5581900000002', timestamp: '1767000001', type: 'button', button: { payload: 'CONFIRMAR_PRESENCA', text: 'Confirmar' } },
      { id: 'w3', from: '5581900000003', timestamp: '1767000002', type: 'interactive', interactive: { button_reply: { id: '1', title: 'Confirmar' } } },
      { id: 'w4', from: '5581900000004', timestamp: '1767000003', type: 'image', image: {} },
    ],
  } }] }] };
  const r = extrairRespostas(corpo);
  assert.deepEqual(r.map((x) => [x.idMensagem, x.telefone, x.texto]), [['w1', '5581900000001', 'Sim'], ['w2', '5581900000002', 'CONFIRMAR_PRESENCA'], ['w3', '5581900000003', '1']]);
  assert.equal(r[0].recebidaEm.toISOString(), new Date(1767000000 * 1000).toISOString());
  assert.deepEqual(extrairRespostas(null), []);
  assert.deepEqual(extrairRespostas({ entry: 'x' }), []);
});

test('US-30: contrato de consulta.confirmada', () => {
  const evento = criarEnvelope({ tipo: 'consulta.confirmada', origem: 'notificacao', id_correlacao: 'consulta-1', payload: { id_consulta: '1', canal: 'whatsapp', confirmada_em: new Date().toISOString() } });
  assert.equal(validarConsultaConfirmada(evento).ok, true);
  assert.equal(validarConsultaConfirmada({ ...evento, origem: 'agendamento' }).ok, false);
  assert.equal(validarConsultaConfirmada({ ...evento, payload: { ...evento.payload, canal: 'sms' } }).ok, false);
  assert.equal(validarConsultaConfirmada({ ...evento, payload: { ...evento.payload, id_consulta: '' } }).ok, false);
});
