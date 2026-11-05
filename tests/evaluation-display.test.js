import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluationSummary } from '../src/lib/evaluation.js';

test('converts only for display and identifies an average separately from a single result', () => {
  const person = { evaluacion: 36.27, evaluacionMaximo: 40, evaluacionRegistros: 2, evaluacionPeriodo: '2026-01' };
  assert.deepEqual(evaluationSummary(person), {
    equivalent: '9.07 / 10', original: '36.27 / 40',
    context: 'Promedio de 2 resultados institucionales · 2026-01',
  });
  assert.equal(person.evaluacion, 36.27);
  assert.equal(evaluationSummary({ ...person, evaluacionRegistros: 1 }).context, 'Resultado institucional · 2026-01');
});

test('missing scores or scales are not presented as zero; published zero is valid', () => {
  assert.equal(evaluationSummary({}), null);
  assert.equal(evaluationSummary({ evaluacion: 30 }), null);
  assert.equal(evaluationSummary({ evaluacion: 30, evaluacionMaximo: 0 }), null);
  assert.equal(evaluationSummary({ evaluacion: null, evaluacionMaximo: 40 }), null);
  assert.equal(evaluationSummary({ evaluacion: 0, evaluacionMaximo: 40 }).equivalent, '0.00 / 10');
});
