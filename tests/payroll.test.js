import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverUniversities, getSearchDataset, toSearchPeople } from '../src/lib/payroll.js';

function dataset(overrides = {}) {
  return {
    estado: 'pendiente_revision', identificadorInstitucion: 'prueba', anio: '2026',
    institucion: 'AGU - Universidad de prueba', fuente: { sha256: 'abcdef1234567890' },
    registros: [{ origen: { fila: 1 }, nombre: { nombres: 'ANA', primerApellido: 'PEREZ', segundoApellido: null },
      puesto: 'PROFESORA', cargo: null, area: null, periodo: { inicio: '2026-04-01', fin: '2026-06-30' },
      remuneracionMensual: { bruto: 0, neto: null }, actualizacionFuente: '2026-07-02' }],
    ...overrides,
  };
}

test('discovers institutions without a registry and publishes only their latest year', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'payroll-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const year of ['2025', '2026']) {
    const directory = path.join(root, 'prueba', year);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'nomina.json'), JSON.stringify(dataset({ anio: year })));
  }
  const catalog = await discoverUniversities(root);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, 'prueba');
  assert.equal(catalog[0].year, '2026');
  assert.equal(catalog[0].name, 'Universidad de prueba');
  assert.equal(catalog[0].url, '/data/prueba/2026.json');
  assert.deepEqual(catalog[0].updates, ['2026-07-02']);
  await writeFile(path.join(root, 'prueba/2026/nomina.json'), JSON.stringify(dataset({ estado: 'bloqueado' })));
  await assert.rejects(discoverUniversities(root), /blocked/);
});

test('build rejects institution/year metadata that differs from its directory', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'payroll-mismatch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'prueba', '2026');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'nomina.json'), JSON.stringify(dataset({ anio: '2025' })));
  await assert.rejects(discoverUniversities(root), /does not match/);
});

test('projection preserves zeros, absence and source descriptions, with links scoped to the input', () => {
  const raw = dataset();
  const before = structuredClone(raw);
  const [person] = toSearchPeople(raw);
  assert.equal(person.bruto, 0);
  assert.equal(person.neto, null);
  assert.equal(person.area, null);
  assert.equal(person.puesto, 'PROFESORA');
  assert.equal(person.puesto_base, 'PROFESORA');
  assert.equal(person.nombre, 'ANA PEREZ');
  assert.equal(person.id, 'abcdef1234567890-1');
  assert.deepEqual(raw, before);
  assert.notEqual(toSearchPeople({ ...raw, fuente: { sha256: 'different-source' } })[0].id, person.id);
});

test('display does not append surnames already present at the end of the given-name field', () => {
  const raw = dataset();
  raw.registros[0].nombre.nombres = 'ANA PEREZ';
  const [person] = toSearchPeople(raw);
  assert.equal(person.nombre, 'ANA PEREZ');
  assert.equal(person.nombres, 'ANA');
  assert.equal(person.apellidos, 'PEREZ');
  assert.equal(raw.registros[0].nombre.nombres, 'ANA PEREZ');
});

test('discovers prepared uag dataset with valid metadata and search projection', async () => {
  const catalog = await discoverUniversities();
  const uag = catalog.find((item) => item.id === 'uag');
  assert.ok(uag, 'uag must be present in discovered catalog');
  assert.equal(uag.name, 'Universidad de Guanajuato');
  assert.equal(uag.year, '2026');
  assert.equal(uag.url, '/data/uag/2026.json');
  assert.equal(uag.records, 1991);
  assert.deepEqual(uag.period, { inicio: '2026-04-01', fin: '2026-06-30' });

  const people = await getSearchDataset('uag', '2026');
  assert.equal(people.length, 1991);
  assert.ok(people.every((p) => typeof p.id === 'string' && p.id.startsWith('8b11f7781ca1228b-')));
  assert.ok(people.every((p) => p.nombre && typeof p.bruto === 'number'));
});
