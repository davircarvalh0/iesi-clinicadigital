// Renderiza os componentes como a recepção os vê (HTML estático), cobrindo os critérios da US-18.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Indicadores } from '../src/agenda/Indicadores';
import { ItemConsulta } from '../src/agenda/ItemConsulta';
import { EstadoSincronizacao } from '../src/componentes/EstadoSincronizacao';
import type { AcaoCancelamento, Situacao } from '../src/sincronizacao';
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
const nada = () => {};

function item(c: Consulta, opcoes: { lembrete?: Lembrete; situacao?: Situacao; acao?: AcaoCancelamento } = {}) {
  return renderToStaticMarkup(
    <ItemConsulta consulta={c} lembrete={opcoes.lembrete} situacaoLembretes={opcoes.situacao ?? 'atualizado'}
      acao={opcoes.acao} aoRemarcar={nada} aoCancelar={nada} />,
  );
}

describe('CA1: erro ao cancelar', () => {
  test('falha informada, consulta segue agendada e sem cancelamento confirmado', () => {
    const html = item(consulta(), { lembrete: lembrete(), acao: { fase: 'falhou', mensagem: 'Não foi possível concluir o cancelamento: Erro interno.' } });
    assert.match(html, /role="alert"[^>]*>Não foi possível concluir o cancelamento: Erro interno\./);
    assert.match(html, />Agendada</);
    assert.doesNotMatch(html, /Cancelada|Cancelamento confirmado/);
    assert.match(html, /<button class="acao acao--perigo">.*Cancelar<\/button>/, 'pode tentar de novo');
  });
  test('resultado incerto: avisa, trava repetição e não confirma', () => {
    const html = item(consulta(), { lembrete: lembrete(), acao: { fase: 'incerta', mensagem: 'Sem resposta do serviço: confira a agenda.', em: 1 } });
    assert.match(html, /role="alert"[^>]*>Sem resposta do serviço/);
    assert.match(html, /<button class="acao acao--perigo" disabled="">/);
    assert.doesNotMatch(html, /Cancelamento confirmado/);
  });
  test('enviando: botão ocupado e sem confirmação antecipada', () => {
    const html = item(consulta(), { lembrete: lembrete(), acao: { fase: 'enviando' } });
    assert.match(html, /Cancelando…/);
    assert.match(html, /aria-busy="true"/);
    assert.doesNotMatch(html, /Cancelamento confirmado/);
  });
  test('confirmado só com resposta do Agendamento, com horário', () => {
    const html = item(consulta({ status: 'cancelada' }), { lembrete: lembrete(), acao: { fase: 'confirmada', em: Date.UTC(2026, 10, 24, 17, 3, 12) } });
    assert.match(html, /Cancelamento confirmado às 14:03:12/);
  });
});

describe('CA2: Notificação indisponível', () => {
  test('nunca respondeu: situação desconhecida, sem "aguardando" nem status inventado', () => {
    const html = item(consulta(), { situacao: 'indisponivel' });
    assert.match(html, /Lembrete: situação desconhecida/);
    assert.doesNotMatch(html, /Lembrete programado|Sincronização pendente/);
  });
  test('falhou depois de responder: último estado marcado como desatualizado', () => {
    const html = item(consulta(), { lembrete: lembrete(), situacao: 'desatualizado' });
    assert.match(html, /Lembrete programado · desatualizado/);
    assert.match(html, /selo--neutro/);
  });
  test('indicador não mostra 0 lembretes quando a Notificação está fora', () => {
    const html = renderToStaticMarkup(
      <Indicadores consultas={[consulta()]} lembretes={[]} situacaoConsultas="atualizado" situacaoLembretes="indisponivel" cadastroIndisponivel={false} />,
    );
    assert.match(html, /Lembretes programados<\/span><strong[^>]*>Indisponível/);
  });
  test('indicador com dado velho avisa desatualizado', () => {
    const html = renderToStaticMarkup(
      <Indicadores consultas={[]} lembretes={[lembrete()]} situacaoConsultas="atualizado" situacaoLembretes="desatualizado" cadastroIndisponivel={false} />,
    );
    assert.match(html, />1 · desatualizado</);
  });
});

describe('CA3: sincronização pendente', () => {
  test('cancelada no Agendamento, lembrete ainda programado: pendente', () => {
    const html = item(consulta({ status: 'cancelada' }), { lembrete: lembrete() });
    assert.match(html, /Sincronização pendente/);
    assert.match(html, /ainda não recebeu o cancelamento/);
  });
  test('quando o resultado chega, a pendência some e mostra o lembrete cancelado', () => {
    const html = item(consulta({ status: 'cancelada' }), { lembrete: lembrete({ status: 'cancelado' }) });
    assert.doesNotMatch(html, /Sincronização pendente/);
    assert.match(html, /Lembrete cancelado/);
  });
  test('remarcada e ainda não processada: pendente com o horário anterior', () => {
    const html = item(consulta({ inicio: '2026-12-02T13:00:00.000Z' }), { lembrete: lembrete() });
    assert.match(html, /Sincronização pendente/);
    assert.match(html, /ainda tem o horário anterior/);
  });
  test('agendada sem lembrete: aguardando programação', () => {
    assert.match(item(consulta()), /Aguardando a Notificação programar o lembrete/);
  });
});

describe('Estado e horário da última atualização (US-18-T2)', () => {
  const em = Date.UTC(2026, 10, 24, 17, 3, 12); // 14:03:12 em Recife
  test('mostra cada serviço com horário e o total pendente', () => {
    const html = renderToStaticMarkup(
      <EstadoSincronizacao pendentes={2} recursos={[
        { nome: 'Agendamento', situacao: 'atualizado', atualizadoEm: em },
        { nome: 'Notificação', situacao: 'indisponivel', atualizadoEm: null },
        { nome: 'Cadastro', situacao: 'atrasado', atualizadoEm: em },
      ]} />,
    );
    assert.match(html, /Agendamento<\/strong> · atualizado às 14:03:12/);
    assert.match(html, /Notificação<\/strong> · indisponível · situação desconhecida/);
    assert.match(html, /Cadastro<\/strong> · atualização atrasada · último dado às 14:03:12/);
    assert.match(html, /Sincronização pendente em 2 consultas/);
  });
  test('desatualizado mostra o horário do último dado', () => {
    const html = renderToStaticMarkup(
      <EstadoSincronizacao pendentes={0} recursos={[{ nome: 'Notificação', situacao: 'desatualizado', atualizadoEm: em }]} />,
    );
    assert.match(html, /indisponível · último dado às 14:03:12/);
    assert.match(html, /sincronizacao__item--perigo/);
  });
});
