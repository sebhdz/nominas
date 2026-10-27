import test from 'node:test';
import assert from 'node:assert/strict';
import { findPeople, findPensioners, isProfessor } from '../src/scripts/search-utils.js';

const people = [
  { id: 1, nombre: 'DELIA ALMEIDA REYNOSO', area: 'COMUNICACION', puesto: 'JEFA DE PROTOCOLO', puesto_base: 'JEFA', bruto: 200, neto: 100 },
  { id: 2, nombre: 'ANA PEREZ', area: 'BIOLOGIA', puesto: 'PROFESORA', puesto_base: 'PROF. INVEST. TITULAR', bruto: 300, neto: 200 },
  { id: 3, nombre: 'LUIS LOPEZ', area: 'BIOLOGIA', puesto: 'PROFESOR', puesto_base: 'PROFESOR DE ASIGNATURA', bruto: 100, neto: 80 },
  { id: 4, nombre: 'MARIA LOPEZ', area: 'BIOLOGIA', puesto: 'RECTORA', puesto_base: 'RECTOR/A', bruto: 400, neto: 300 },
];

test('busca con acentos y palabras en distinto orden; acepta área y puesto', () => {
  assert.ok(findPeople(people, ' REYNÓSO délia ALMEIDA ').some(person => person.id === 1));
  assert.ok(findPeople(people, 'délia protocolo').some(person => person.id === 1));
  assert.deepEqual(findPeople(people, 'zzzzPersonaInexistente'), []);
});

test('los filtros de puesto son complementarios y usan la descripción publicada', () => {
  const professors = findPeople(people, '', { group: 'professors' });
  const others = findPeople(people, '', { group: 'others' });
  assert.ok(professors.length > 0 && others.length > 0);
  assert.equal(professors.length + others.length, people.length);
  assert.ok(professors.every(isProfessor));
  assert.ok(others.every(person => !isProfessor(person)));
  assert.ok(isProfessor({ puesto_base: 'PROF. INVEST. TITULAR', puesto: 'JEFE/A DE DEPARTAMENTO' }));
});

test('combina búsqueda, área, tipo de puesto y mayor sueldo bruto', () => {
  const matches = findPeople(people, 'prof', { area: 'BIOLOGIA', group: 'professors' });
  assert.ok(matches.length > 0);
  assert.ok(matches.every(person => person.area === 'BIOLOGIA' && isProfessor(person)));
  assert.ok(matches.every((person, index) => index === 0 || matches[index - 1].bruto >= person.bruto));
});

test("ordena por bruto descendente de forma predeterminada, también al buscar", () => {
  for (const query of ["", "prof", "rector"]) {
    const matches = findPeople(people, query);
    assert.ok(matches.length > 0);
    assert.ok(matches.every((person, index) => index === 0 || matches[index - 1].bruto >= person.bruto));
  }
});

test('ordena de menor a mayor, también con búsqueda y filtros', () => {
  for (const options of [{ order: 'asc' }, { order: 'asc', area: 'BIOLOGIA', group: 'professors' }]) {
    const matches = findPeople(people, '', options);
    assert.ok(matches.length > 1);
    assert.ok(matches.every((person, index) => index === 0 || matches[index - 1].bruto <= person.bruto));
  }
});

test('missing amounts are not treated as zero when sorting', () => {
  const sample = [...people, { id: 5, nombre: 'SIN IMPORTE', area: null, puesto: null, bruto: null, neto: null }];
  for (const order of ['asc', 'desc']) assert.equal(findPeople(sample, '', { order }).at(-1).id, 5);
});

test('pension search combines name, area, type and status with shared area and pension filters', () => {
  const records = [
    { id: 1, nombre: 'MARIA PEREZ', area: 'RECURSOS HUMANOS', tipo: 'Años de Servicio', estatus: 'Jubilado(a)', monto: 900, periodicidad: 'Quincenal' },
    { id: 2, nombre: 'JOSE LOPEZ', area: 'FINANZAS', tipo: 'Pensión por viudez', estatus: 'Pensionado(a)', monto: 1200, periodicidad: 'Mensual' },
  ];
  assert.deepEqual(findPensioners(records, 'pension viudez', { area: 'FINANZAS', status: 'Pensionado(a)' }).map(({ id }) => id), [2]);
  assert.deepEqual(findPensioners(records, 'maria años', { type: 'Años de Servicio' }).map(({ id }) => id), [1]);
});

test('pension amounts sort as reported without periodicity conversion; null stays last', () => {
  const records = [
    { id: 1, nombre: 'QUINCENAL', monto: 900, periodicidad: 'Quincenal' },
    { id: 2, nombre: 'MENSUAL', monto: 1200, periodicidad: 'Mensual' },
    { id: 3, nombre: 'SIN DATO', monto: null, periodicidad: null },
  ];
  assert.deepEqual(findPensioners(records, '').map(({ id }) => id), [2, 1, 3]);
  assert.deepEqual(findPensioners(records, '', { order: 'asc' }).map(({ id }) => id), [1, 2, 3]);
});
