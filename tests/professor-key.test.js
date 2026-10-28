import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfessorKey, getProfessorSlug } from '../src/lib/professor-key.js';

test('getProfessorKey is deterministic across case, accents, and spacing', () => {
  const key1 = getProfessorKey('uaa', 'ANA PÉREZ');
  const key2 = getProfessorKey('uaa', 'ana perez  ');
  const key3 = getProfessorKey('uaa', 'Ana    Pérez');

  assert.equal(key1, key2);
  assert.equal(key2, key3);
  assert.match(key1, /^[a-f0-9]{16}$/);
});

test('getProfessorKey distinguishes different universities and names', () => {
  const keyUAA = getProfessorKey('uaa', 'ANA PÉREZ');
  const keyUNAM = getProfessorKey('unam', 'ANA PÉREZ');
  const keyDifferentName = getProfessorKey('uaa', 'JUAN LÓPEZ');

  assert.notEqual(keyUAA, keyUNAM);
  assert.notEqual(keyUAA, keyDifferentName);
});

test('getProfessorKey handles null or empty inputs gracefully', () => {
  const keyEmpty = getProfessorKey('', '');
  assert.match(keyEmpty, /^[a-f0-9]{16}$/);
  const keyNull = getProfessorKey(null, null);
  assert.equal(keyEmpty, keyNull);
});

test('getProfessorSlug generates human-readable slug with colon', () => {
  assert.equal(getProfessorSlug('uaa', 'ANA PÉREZ'), 'uaa:ana-perez');
  assert.equal(getProfessorSlug('uaa', 'JUAN CARLOS ARREDONDO HERNANDEZ'), 'uaa:juan-carlos-arredondo-hernandez');
  assert.equal(getProfessorSlug('', ''), 'desconocido');
});
