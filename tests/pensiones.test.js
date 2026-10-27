import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePensions, parsePensionDate } from '../scripts/pensiones/prepare.js';

const columns = [
  'Ejercicio',
  'Fecha de inicio del periodo que se informa',
  'Fecha de término del periodo que se informa',
  'Estatus (catálogo)',
  'Tipo de jubilación o pensión',
  'Nombre(s)',
  'Primer apellido',
  'Segundo apellido',
  'Sexo (catálogo)',
  'Monto de la porción de su pensión que recibe directamente del Estado Mexicano',
  'Periodicidad del monto recibido',
  'Área(s) responsable(s) que genera(n), posee(n), publica(n) y actualiza(n) la información',
  'Fecha de Actualización',
  'Nota',
];

const row = [
  '2026', '01/01/2026', '31/03/2026', 'Jubilado(a)', 'Años de Servicio',
  'ANA', 'PEREZ', 'LOPEZ', 'Mujer', '1234.5678', 'Quincenal', 'Recursos Humanos',
  '2026-04-07 00:00:00', 'Nota fuente',
];
const source = { identificadorInstitucion: 'prueba', archivo: 'data/pensions/PRUEBA-pensiones.json', sha256: 'a'.repeat(64) };
const fixture = (filas = [row], columnas = columns) => ({
  institucion: 'Universidad de prueba',
  obligacion: 'Jubilados y pensionados',
  formato: 'Listado de personas jubiladas y pensionadas',
  columnas: [...columnas],
  filas: filas.map((sourceRow) => [...sourceRow]),
});

test('dates convert supported formats and reject invalid dates', () => {
  assert.equal(parsePensionDate('01/04/2026'), '2026-04-01');
  assert.equal(parsePensionDate('2026-04-07 00:00:00'), '2026-04-07');
  assert.equal(parsePensionDate('31/04/2026'), null);
});

test('maps source rows by header and preserves amount periodicity and provenance', () => {
  const raw = fixture();
  raw.columnas.unshift('Columna adicional');
  raw.filas[0].unshift('extra');
  raw.columnas.reverse();
  raw.filas[0].reverse();
  const result = preparePensions(raw, source);
  assert.equal(result.filasEntrada, 1);
  assert.deepEqual(result.registros[0].origen, { fila: 1 });
  assert.equal(result.registros[0].monto, 1234.5678);
  assert.equal(result.registros[0].montoFuente, '1234.5678');
  assert.equal(result.registros[0].periodicidad, 'Quincenal');
  assert.equal(result.registros[0].periodo.inicio, '2026-01-01');
  assert.equal(result.registros[0].actualizacionFuente, '2026-04-07');
  assert.equal(result.fuente.sha256, source.sha256);
});

test('retains source rows without person or amount details', () => {
  const explanation = [...row];
  for (const index of [3, 5, 6, 7, 8, 9, 10]) explanation[index] = '';
  explanation[4] = 'Ver nota';
  explanation[13] = 'La universidad remite a la entidad de seguridad social.';
  const result = preparePensions(fixture([explanation]), source);
  assert.equal(result.registros.length, 1);
  assert.equal(result.registros[0].nombre.nombres, null);
  assert.equal(result.registros[0].monto, null);
  assert.equal(result.registros[0].tipo, 'Ver nota');
  assert.match(result.registros[0].nota, /seguridad social/);
});

test('rejects invalid containers, ambiguous/missing headers, and malformed rows', () => {
  assert.throws(() => preparePensions(null, source), /Invalid PNT pension document/);
  assert.throws(() => preparePensions(fixture([row], columns.slice(1)), source), /source column for/);
  const ambiguous = fixture();
  ambiguous.columnas.push(columns[0]);
  ambiguous.filas[0].push('2026');
  assert.throws(() => preparePensions(ambiguous, source), /source column for ejercicio/);
  assert.throws(() => preparePensions(fixture([[...row, 'extra']]), source), /row length at row 1/);
});

test('preparation is deterministic', () => {
  const raw = fixture();
  const first = preparePensions(raw, source);
  const second = preparePensions(raw, source);
  assert.deepEqual(second, first);
});
