import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cabeNaDisponibilidade, horariosLivres, instanteNaClinica, intervalosSobrepostos, noFusoDaClinica, proximoDia, sobrepoe } from '../src/agenda/horario';

// 2026-12-07 é uma segunda-feira (diaSemana 1).
const SEGUNDA = '2026-12-07';
const manha = { diaSemana: 1, inicioMinutos: 8 * 60, fimMinutos: 12 * 60 };
const antes = new Date('2026-12-01T00:00:00Z');

test('US-26: o fuso da clínica decide o dia e a hora, não o fuso do servidor', () => {
  // 01:30 UTC de terça = 22:30 de segunda em Recife.
  assert.deepEqual(noFusoDaClinica(new Date('2026-12-08T01:30:00Z')), { data: SEGUNDA, diaSemana: 1, minutos: 22 * 60 + 30 });
  assert.equal(instanteNaClinica(SEGUNDA, 8 * 60).toISOString(), '2026-12-07T11:00:00.000Z');
  assert.equal(proximoDia('2026-12-31'), '2027-01-01');
});

test('US-26: grade de horários respeita intervalos, duração, ocupação e o passado', () => {
  const livres = horariosLivres(SEGUNDA, 60, [manha], [], antes).map((d) => noFusoDaClinica(d).minutos / 60);
  assert.deepEqual(livres, [8, 9, 10, 11]);
  const ocupada = { inicio: instanteNaClinica(SEGUNDA, 9 * 60 + 30), duracaoMinutos: 30 };
  assert.deepEqual(horariosLivres(SEGUNDA, 60, [manha], [ocupada], antes).map((d) => noFusoDaClinica(d).minutos / 60), [8, 10, 11]);
  assert.deepEqual(horariosLivres('2026-12-08', 60, [manha], [], antes), [], 'terça sem disponibilidade');
  assert.deepEqual(horariosLivres(SEGUNDA, 60, [manha], [], instanteNaClinica(SEGUNDA, 10 * 60)).length, 1, 'só o futuro');
  assert.deepEqual(horariosLivres(SEGUNDA, 50, [manha], [], antes).length, 4, 'o que não cabe no fim fica de fora');
});

test('US-26: consulta precisa caber inteira na disponibilidade', () => {
  assert.equal(cabeNaDisponibilidade(instanteNaClinica(SEGUNDA, 11 * 60 + 30), 30, [manha]), true);
  assert.equal(cabeNaDisponibilidade(instanteNaClinica(SEGUNDA, 11 * 60 + 45), 30, [manha]), false);
  assert.equal(cabeNaDisponibilidade(instanteNaClinica(SEGUNDA, 7 * 60 + 59), 30, [manha]), false);
});

test('US-26: sobreposição de consultas e de intervalos', () => {
  const as9 = { inicio: instanteNaClinica(SEGUNDA, 9 * 60), duracaoMinutos: 30 };
  assert.equal(sobrepoe(as9, { inicio: instanteNaClinica(SEGUNDA, 9 * 60 + 29), duracaoMinutos: 30 }), true);
  assert.equal(sobrepoe(as9, { inicio: instanteNaClinica(SEGUNDA, 9 * 60 + 30), duracaoMinutos: 30 }), false, 'encostar não é sobrepor');
  assert.equal(intervalosSobrepostos([manha, { diaSemana: 1, inicioMinutos: 11 * 60, fimMinutos: 13 * 60 }]), true);
  assert.equal(intervalosSobrepostos([manha, { diaSemana: 1, inicioMinutos: 12 * 60, fimMinutos: 13 * 60 }]), false);
  assert.equal(intervalosSobrepostos([manha, { ...manha, diaSemana: 2 }]), false);
});
