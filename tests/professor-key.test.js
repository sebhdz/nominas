import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfessorKey } from '../src/lib/professor-key.js';

test('getProfessorKey is deterministic across case, accents, and spacing', () => {
  const key1 = getProfessorKey('uaa', 'ANA PÉREZ');
  const key2 = getProfessorKey('uaa', 'ana perez  ');
  const key3 = getProfessorKey('uaa', 'Ana    Pérez');

  assert.equal(key1, key2);
  assert.equal(key2, key3);
  assert.equal(key1, 'uaa:ana-perez');
});

test('getProfessorKey distinguishes different universities and names', () => {
  const keyUAA = getProfessorKey('uaa', 'ANA PÉREZ');
  const keyUNAM = getProfessorKey('unam', 'ANA PÉREZ');
  const keyDifferentName = getProfessorKey('uaa', 'JUAN LÓPEZ');

  assert.notEqual(keyUAA, keyUNAM);
  assert.notEqual(keyUAA, keyDifferentName);
  assert.equal(keyUAA, 'uaa:ana-perez');
  assert.equal(keyUNAM, 'unam:ana-perez');
  assert.equal(keyDifferentName, 'uaa:juan-lopez');
});

test('getProfessorKey handles null or empty inputs gracefully', () => {
  const keyEmpty = getProfessorKey('', '');
  assert.equal(keyEmpty, 'desconocido');
  const keyNull = getProfessorKey(null, null);
  assert.equal(keyEmpty, keyNull);
});
