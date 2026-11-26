// US-09: regras de filtro e estados da tela de lembretes, renderizados como a recepção os vê.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  alternarSituacao, consultaDoFiltro, intervaloDoPeriodo, totalDePaginas, type FiltroLembretes,
} from '../src/lembretes/filtros';
import { descreverModo } from '../src/lembretes/rotulos';
import { PainelLembretes } from '../src/lembretes/TelaLembretes';
import { telaDoHash } from '../src/navegacao';
import type { Leitura } from '../src/sincronizacao';
import type { ItemPainelLembrete, PaginaLembretes } from '../src/tipos';

// Dia fixo para os cálculos de período: daqui(n) devolve 2026-11-(24+n).
const daqui = (n: number) => `2026-11-${String(24 + n).padStart(2, '0')}`;
const filtro = (dados: Partial<FiltroLembretes> = {}): FiltroLembretes => ({ periodo: 'proximos7', situacoes: [], pagina: 1, ...dados });

describe('filtros da tela de lembretes (US-09 CA2)', () => {
  test('períodos em dias civis', () => {
    assert.deepEqual(intervaloDoPeriodo('hoje', daqui), { de: '2026-11-24', ate: '2026-11-24' });
    assert.deepEqual(intervaloDoPeriodo('proximos7', daqui), { de: '2026-11-24', ate: '2026-11-30' });
    assert.deepEqual(intervaloDoPeriodo('ultimos7', daqui), { de: '2026-11-18', ate: '2026-11-24' });
    assert.deepEqual(intervaloDoPeriodo('todos', daqui), {});
  });
  test('consulta com situações ordenadas, período e paginação', () => {
    const q = new URLSearchParams(consultaDoFiltro(filtro({ situacoes: ['falhou', 'bloqueado'], pagina: 2 }), daqui));
    assert.equal(q.get('situacao'), 'bloqueado,falhou');
    assert.equal(q.get('de'), '2026-11-24');
    assert.equal(q.get('ate'), '2026-11-30');
    assert.equal(q.get('pagina'), '2');
    assert.equal(q.get('tamanhoPagina'), '20');
    const todos = new URLSearchParams(consultaDoFiltro(filtro({ periodo: 'todos' }), daqui));
    assert.equal(todos.has('de') || todos.has('ate') || todos.has('situacao'), false);
  });
  test('alternar situação marca e desmarca e volta para a página 1', () => {
    const marcado = alternarSituacao(filtro({ pagina: 3 }), 'falhou');
    assert.deepEqual(marcado.situacoes, ['falhou']);
    assert.equal(marcado.pagina, 1);
    assert.deepEqual(alternarSituacao(marcado, 'falhou').situacoes, []);
  });
  test('total de páginas nunca é zero', () => {
    assert.equal(totalDePaginas(0), 1);
    assert.equal(totalDePaginas(20), 1);
    assert.equal(totalDePaginas(21), 2);
  });
  test('modo de envio explícito', () => {
    assert.equal(descreverModo({ modoEnvio: 'real', canalEnvio: 'whatsapp' }), 'Real · WhatsApp');
    assert.equal(descreverModo({ modoEnvio: 'simulado', canalEnvio: 'log' }), 'Simulado · log');
    assert.equal(descreverModo({ modoEnvio: null, canalEnvio: null }), 'Ainda sem envio');
  });
  test('o hash #lembretes abre a tela; valores desconhecidos abrem a agenda', () => {
    assert.equal(telaDoHash('#lembretes'), 'lembretes');
    assert.equal(telaDoHash('#pacientes'), 'pacientes');
    assert.equal(telaDoHash('#qualquer'), 'agenda');
  });
});

const item = (dados: Partial<ItemPainelLembrete> = {}): ItemPainelLembrete => ({
  id: 'l1', idConsulta: 'c1', pacienteNome: 'Paciente Exemplo Fictício', profissional: 'Dra. Exemplo', especialidade: 'Teste',
  inicioConsulta: '2026-11-25T13:00:00.000Z', enviarEm: '2026-11-24T13:00:00.000Z', antecedenciaMinutos: 1440,
  status: 'programado', tentativas: 0, motivoFalha: null, enviadoEm: null, modoEnvio: null, canalEnvio: null,
  idExterno: null, atualizadoEm: '2026-11-24T12:00:00.000Z', ...dados,
});
const contagem = { programado: 1, enviando: 0, enviado: 0, simulado: 0, aceito_provedor: 0, falhou: 2, cancelado: 0, bloqueado: 0 };
const pagina = (itens: ItemPainelLembrete[], total = itens.length): PaginaLembretes => ({ itens, total, pagina: 1, tamanhoPagina: 20, contagem });
const AGORA = 1_000_000;

function tela(f: FiltroLembretes, leitura: Leitura<{ consulta: string; pagina: PaginaLembretes }>, consulta = 'q') {
  return renderToStaticMarkup(
    <PainelLembretes filtro={f} leitura={leitura} consulta={consulta} agora={AGORA} aoMudarFiltro={() => {}} aoAtualizar={() => {}} />,
  );
}

describe('tela de lembretes (US-09 CA1 e CA3)', () => {
  test('CA1: mostra paciente, profissional, previsão, situação, modo, tentativas e motivo', () => {
    const html = tela(filtro(), { dados: { consulta: 'q', pagina: pagina([
      item({ status: 'falhou', tentativas: 3, motivoFalha: 'WhatsApp respondeu HTTP 503', modoEnvio: 'real', canalEnvio: 'whatsapp' }),
      item({ id: 'l2', status: 'aceito_provedor', enviadoEm: '2026-11-24T13:00:05.000Z', modoEnvio: 'real', canalEnvio: 'whatsapp', idExterno: 'wamid.ficticio', tentativas: 1 }),
    ]) }, erro: null, atualizadoEm: AGORA - 1000 });
    assert.match(html, /Paciente Exemplo Fictício/);
    assert.match(html, /Dra\. Exemplo · Teste/);
    assert.match(html, /Lembrete falhou/);
    assert.match(html, /WhatsApp respondeu HTTP 503/);
    assert.match(html, /3 tentativa\(s\)/);
    assert.match(html, /Real · WhatsApp/);
    assert.match(html, /Aceito pelo WhatsApp/);
    assert.match(html, /Concluído em/);
    assert.match(html, /wamid\.ficticio/);
    assert.match(html, /2 lembrete\(s\)/);
  });
  test('CA2: filtros mostram a contagem por situação e o estado pressionado', () => {
    const html = tela(filtro({ situacoes: ['falhou'] }), { dados: { consulta: 'q', pagina: pagina([item({ status: 'falhou' })]) }, erro: null, atualizadoEm: AGORA });
    assert.match(html, /aria-pressed="true"[^>]*>Falharam · 2/);
    assert.match(html, /Programados · 1/);
    assert.match(html, /com as situações escolhidas/);
  });
  test('CA3: Notificação nunca respondeu: situação desconhecida, sem "nenhum lembrete"', () => {
    const html = tela(filtro(), { erro: new Error('fora'), atualizadoEm: null });
    assert.match(html, /Notificação indisponível: a situação dos lembretes é desconhecida/);
    assert.match(html, /Tentar novamente/);
    assert.doesNotMatch(html, /Nenhum lembrete/);
  });
  test('CA3: falhou depois de responder: mantém a lista e avisa o horário do último dado', () => {
    const html = tela(filtro(), { dados: { consulta: 'q', pagina: pagina([item()]) }, erro: new Error('fora'), atualizadoEm: AGORA - 60_000 });
    assert.match(html, /Paciente Exemplo Fictício/);
    assert.match(html, /role="alert">Notificação indisponível: a lista é de/);
  });
  test('resposta de outro filtro não é exibida como se fosse do filtro atual', () => {
    const html = tela(filtro(), { dados: { consulta: 'antiga', pagina: pagina([item()]) }, erro: null, atualizadoEm: AGORA }, 'nova');
    assert.match(html, /Carregando lembretes…/);
    assert.doesNotMatch(html, /Paciente Exemplo Fictício/);
  });
  test('vazio com filtro e paginação quando há mais de uma página', () => {
    assert.match(tela(filtro(), { dados: { consulta: 'q', pagina: pagina([]) }, erro: null, atualizadoEm: AGORA }), /Nenhum lembrete com estes filtros/);
    const html = tela(filtro(), { dados: { consulta: 'q', pagina: pagina([item()], 45) }, erro: null, atualizadoEm: AGORA });
    assert.match(html, /Página 1 de 3/);
  });
});
