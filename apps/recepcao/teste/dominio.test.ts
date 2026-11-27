import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErroApi, tipoDaFalha, motivo } from '../src/api/cliente';
import { consultaDoPainel } from '../src/api/servicos';
import type { Consulta, Lembrete } from '../src/api/tipos';
import { chaveDia, inicioDaSemana, momentoRecife, somarDias } from '../src/dominio/datas';
import { cpfCompleto, cpfProtegido, iniciais, mascararCpfDigitado, mascararTelefoneDigitado } from '../src/dominio/documentos';
import { juntarOcorrencias } from '../src/dominio/eventos';
import { desconhecido, frescorDe, velho } from '../src/dominio/frescor';
import { pendenciaDe } from '../src/dominio/lembretes';
import { conferir, MARGEM_CONFERENCIA_MS, resultadoDaFalha } from '../src/telas/agenda/cancelamentos';
import { passosDaTrilha } from '../src/telas/lembretes/GavetaTrilha';
import { intervalo } from '../src/telas/lembretes/TelaLembretes';

const FUTURO = '2099-01-10T10:00:00-03:00';
const consulta = (dados: Partial<Consulta> = {}): Consulta => ({
  id: 'c1', idPaciente: 'p1', vinculoPacientePendente: false, pacienteNome: 'Maria Exemplo', pacienteCpf: '00011122233',
  pacienteTelefone: '81900000000', profissional: 'Dra. Ana', especialidade: 'Cardiologia', inicio: FUTURO, status: 'agendada', ...dados,
});
const lembrete = (dados: Partial<Lembrete> = {}): Lembrete => ({
  id: 'l1', idConsulta: 'c1', status: 'programado', inicioConsulta: FUTURO, enviarEm: '2099-01-09T10:00:00-03:00',
  antecedenciaMinutos: 1440, enviadoEm: null, modoEnvio: null, canalEnvio: null, idExterno: null, tentativas: 0, motivoFalha: null, ...dados,
});

describe('frescor do dado (US-18)', () => {
  it('sem resposta ainda é carregando; falha sem dado é indisponível', () => {
    assert.equal(frescorDe({ temDados: false, temErro: false, atualizadoEm: 0 }, 1000, 500), 'carregando');
    assert.equal(frescorDe({ temDados: false, temErro: true, atualizadoEm: 0 }, 1000, 500), 'indisponivel');
  });
  it('falha com dado anterior é desatualizado; dado velho sem falha é atrasado', () => {
    assert.equal(frescorDe({ temDados: true, temErro: true, atualizadoEm: 900 }, 1000, 500), 'desatualizado');
    assert.equal(frescorDe({ temDados: true, temErro: false, atualizadoEm: 100 }, 1000, 500), 'atrasado');
    assert.equal(frescorDe({ temDados: true, temErro: false, atualizadoEm: 900 }, 1000, 500), 'atual');
  });
  it('classifica o que é desconhecido e o que é velho', () => {
    assert.ok(desconhecido('indisponivel') && desconhecido('carregando') && !desconhecido('desatualizado'));
    assert.ok(velho('atrasado') && velho('desatualizado') && !velho('atual'));
  });
});

describe('pendência de sincronização entre agenda e lembrete', () => {
  it('consulta futura sem lembrete aguarda programação', () => {
    assert.equal(pendenciaDe(consulta(), undefined), 'programacao');
  });
  it('consulta passada sem lembrete não é pendência', () => {
    assert.equal(pendenciaDe(consulta({ inicio: '2000-01-01T10:00:00-03:00' }), undefined), null);
  });
  it('lembrete com horário anterior aguarda a remarcação', () => {
    assert.equal(pendenciaDe(consulta({ inicio: '2099-01-10T11:00:00-03:00' }), lembrete()), 'remarcacao');
  });
  it('mesmo instante em fusos diferentes não é remarcação', () => {
    assert.equal(pendenciaDe(consulta({ inicio: '2099-01-10T13:00:00.000Z' }), lembrete()), null);
  });
  it('consulta cancelada com lembrete ainda programado aguarda o cancelamento', () => {
    assert.equal(pendenciaDe(consulta({ status: 'cancelada' }), lembrete()), 'cancelamento');
  });
  it('lembrete já encerrado não fica pendente após cancelamento', () => {
    for (const status of ['cancelado', 'simulado', 'aceito_provedor', 'falhou', 'bloqueado', 'incerto'] as const) {
      assert.equal(pendenciaDe(consulta({ status: 'cancelada' }), lembrete({ status })), null, status);
    }
  });
});

describe('cancelamento com falha (US-18)', () => {
  it('409 significa que a consulta já estava cancelada', () => {
    assert.equal(resultadoDaFalha(new ErroApi(409, 'Consulta já cancelada.')).fase, 'confirmado');
  });
  it('sem resposta é incerto; erro com resposta é recusado', () => {
    assert.equal(resultadoDaFalha(new TypeError('Failed to fetch')).fase, 'incerto');
    assert.equal(resultadoDaFalha(new ErroApi(504, 'x')).fase, 'incerto');
    assert.equal(resultadoDaFalha(new ErroApi(404, 'Consulta não encontrada.')).fase, 'recusado');
  });
  it('incerto vira confirmado quando a agenda lida depois mostra a consulta cancelada', () => {
    const estado = { fase: 'incerto' as const, em: 1000 };
    assert.equal(conferir(estado, consulta({ status: 'cancelada' }), 1500).fase, 'confirmado');
    assert.equal(conferir(estado, consulta({ status: 'cancelada' }), 900).fase, 'incerto', 'leitura anterior à falha não vale');
  });
  it('incerto vira recusado só depois da margem, se a consulta continua agendada', () => {
    const estado = { fase: 'incerto' as const, em: 1000 };
    assert.equal(conferir(estado, consulta(), 1000 + MARGEM_CONFERENCIA_MS - 1).fase, 'incerto');
    assert.equal(conferir(estado, consulta(), 1000 + MARGEM_CONFERENCIA_MS + 1).fase, 'recusado');
  });
});

describe('classificação de falhas', () => {
  it('502, 503 e 504 do gateway são incertos', () => {
    for (const s of [502, 503, 504]) assert.equal(tipoDaFalha(new ErroApi(s, 'x')), 'incerta');
    assert.equal(tipoDaFalha(new ErroApi(400, 'x')), 'recusada');
  });
  it('motivo legível para prazo esgotado', () => {
    assert.equal(motivo(new DOMException('x', 'TimeoutError')), 'o serviço não respondeu a tempo');
    // Sem o ponto final: quem concatena (`${motivo(e)}.`) decide a pontuação, senão duplica.
    assert.equal(motivo(new ErroApi(400, 'CPF inválido.')), 'CPF inválido');
  });
});

describe('datas no fuso de Recife', () => {
  it('dia civil é o de Recife, não o UTC', () => {
    assert.equal(chaveDia('2026-11-27T01:30:00Z'), '2026-11-26');
    assert.equal(momentoRecife('2026-11-27', '09:00'), '2026-11-27T09:00:00-03:00');
  });
  it('soma dias e acha a segunda-feira', () => {
    assert.equal(somarDias('2026-11-30', 1), '2026-12-01');
    assert.equal(inicioDaSemana('2026-11-26'), '2026-11-23');
    assert.equal(inicioDaSemana('2026-11-29'), '2026-11-23');
    assert.equal(inicioDaSemana('2026-11-23'), '2026-11-23');
  });
  it('períodos do painel de lembretes', () => {
    assert.deepEqual(intervalo('hoje', '2026-11-26'), { de: '2026-11-26', ate: '2026-11-26' });
    assert.deepEqual(intervalo('proximos', '2026-11-26'), { de: '2026-11-26', ate: '2026-12-02' });
    assert.deepEqual(intervalo('anteriores', '2026-11-26'), { de: '2026-11-20', ate: '2026-11-26' });
    assert.deepEqual(intervalo('todos', '2026-11-26'), {});
  });
});

describe('documentos', () => {
  it('máscara de CPF e telefone durante a digitação', () => {
    assert.equal(mascararCpfDigitado('00091468650'), '000.914.686-50');
    assert.equal(mascararCpfDigitado('0009'), '000.9');
    assert.ok(cpfCompleto('000.914.686-50'));
    assert.equal(mascararTelefoneDigitado('81900000101'), '(81) 90000-0101');
    assert.equal(mascararTelefoneDigitado('5581900000101'), '(81) 90000-0101');
    assert.equal(mascararTelefoneDigitado('8133334444'), '(81) 3333-4444');
  });
  it('CPF protegido mostra só os dígitos do meio (US-02)', () => {
    assert.equal(cpfProtegido('00091468650'), '•••.914.686-••');
    assert.equal(cpfProtegido('123'), '•••');
  });
  it('iniciais ignoram preposições', () => {
    assert.equal(iniciais('Maria Exemplo da Silva'), 'MS');
    assert.equal(iniciais('João'), 'J');
  });
});

describe('integração ao vivo e trilha', () => {
  it('junta eventos e atividades do mais recente para o mais antigo', () => {
    const lista = juntarOcorrencias(
      [{ id: 'e1', idEvento: 'ev-1', tipo: 'consulta.agendada', duplicado: false, criadoEm: '2026-11-26T10:00:00Z', publicadoEm: '2026-11-26T10:00:01Z', idConsulta: 'c1', pacienteNome: 'Maria', inicio: FUTURO }],
      [{ id: 'a1', acao: 'evento.duplicado', descricao: 'repetido', idEvento: 'ev-1', idConsulta: 'c1', ocorridoEm: '2026-11-26T10:00:05Z' }],
    );
    assert.deepEqual(lista.map((o) => o.titulo), ['Evento duplicado ignorado', 'Consulta agendada publicada']);
  });
  it('evento ainda não confirmado pelo broker fica em alerta', () => {
    const [o] = juntarOcorrencias([{ id: 'e1', idEvento: 'ev', tipo: 'consulta.cancelada', duplicado: false, criadoEm: '2026-11-26T10:00:00Z', publicadoEm: null, idConsulta: 'c1', pacienteNome: 'Maria', inicio: FUTURO }], []);
    assert.equal(o.tom, 'alerta');
    assert.match(o.detalhe, /aguardando o broker/);
  });
  it('trilha em ordem cronológica com tentativas e decisões', () => {
    const passos = passosDaTrilha({
      lembrete: { id: 'l1', idConsulta: 'c1', status: 'incerto', enviarEm: FUTURO, enviadoEm: null, tentativas: 1, motivoFalha: null, modoEnvio: 'real', canalEnvio: 'whatsapp', idExterno: null, inicioConsulta: FUTURO, idEventoConsulta: null, incertoResolvidoEm: null },
      atividades: [{ id: 'a1', acao: 'lembrete.programado', descricao: 'programado', idEvento: null, ocorridoEm: '2026-11-26T09:00:00Z' }],
      tentativas: [{ id: 't1', numero: 1, idEventoConsulta: null, canal: 'whatsapp', modo: 'real', resultado: 'indeterminado', idExterno: null, motivo: 'tempo esgotado', iniciadaEm: '2026-11-26T10:00:00Z', concluidaEm: null }],
      resolucoes: [{ id: 'r1', acao: 'manter_sem_reenvio', solicitante: 'Juliana', registradaEm: '2026-11-26T11:00:00Z' }],
    });
    assert.deepEqual(passos.map((p) => p.titulo), ['Lembrete programado', 'Tentativa 1: sem confirmação', 'Mantido sem reenvio pela recepção']);
  });
  it('filtro do painel vira a consulta que a Notificação espera', () => {
    assert.equal(consultaDoPainel({ situacoes: ['falhou', 'bloqueado'], de: '2026-11-26', ate: '2026-12-02', pagina: 2, tamanhoPagina: 20 }),
      'pagina=2&tamanhoPagina=20&situacao=falhou%2Cbloqueado&de=2026-11-26&ate=2026-12-02');
  });
});
