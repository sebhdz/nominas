import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverUniversities, toSearchPeople, toBenefitBlocks } from '../src/lib/payroll.js';
import { writePreparedJson } from '../src/lib/prepared-json.js';

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
    await writePreparedJson(path.join(directory, 'nomina.json'), dataset({ anio: year }));
  }
  const catalog = await discoverUniversities(root);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, 'prueba');
  assert.equal(catalog[0].year, '2026');
  assert.equal(catalog[0].name, 'Universidad de prueba');
  assert.equal(catalog[0].url, '/data/prueba/2026.json');
  assert.deepEqual(catalog[0].updates, ['2026-07-02']);
  await writePreparedJson(path.join(root, 'prueba/2026/nomina.json'), dataset({ estado: 'bloqueado' }));
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

test('older prepared records without additional concepts have no detail URL or blocks', () => {
  const data = dataset({ version: 2 });
  assert.deepEqual(toBenefitBlocks(data), []);
  assert.equal('prestacionesUrl' in toSearchPeople(data)[0], false);
});

test('benefit blocks and search links agree across boundaries and omit nonmonetary or zero concepts', () => {
  const data = dataset();
  const base = data.registros[0];
  data.registros = Array.from({ length: 201 }, (_, i) => ({ ...base, origen: { fila: i + 1 },
    percepcionesAdicionales: [{ categoria: 'Primas', conceptos: [
      { concepto: 'Cero', bruto: 0, neto: null },
      { concepto: 'Sin importe', bruto: null, neto: null },
      { concepto: 'Prima', bruto: 123.4567, neto: null, periodicidad: 'CCT 73' },
      { concepto: 'Ajuste', bruto: null, neto: -10, periodicidad: 'ANUAL' },
    ] }, { categoria: 'En especie', conceptos: [{ concepto: 'Vales' }] }],
  }));
  const before = structuredClone(data);
  const blocks = toBenefitBlocks(data);
  assert.deepEqual(blocks.map(b => Object.keys(b.records).length), [100, 100, 1]);
  const people = toSearchPeople(data);
  for (const index of [0, 99, 100, 200]) {
    const block = blocks.find(b => b.url === people[index].prestacionesUrl);
    assert.ok(block);
    assert.equal(block.records[people[index].id].length, 2);
    assert.equal(block.records[people[index].id][0].bruto, 123.4567);
    assert.equal(block.records[people[index].id][0].periodicidad, 'CCT 73');
    assert.equal(block.records[people[index].id][1].neto, -10);
    assert.equal(people[index].bruto, 0);
    assert.equal('percepcionesAdicionales' in people[index], false);
  }
  assert.deepEqual(data, before);
  assert.notEqual(toBenefitBlocks({ ...data, fuente: { sha256: 'another-source' } })[0].url, blocks[0].url);
});
