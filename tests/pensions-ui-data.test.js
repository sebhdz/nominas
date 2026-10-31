import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverPensionDatasets, toSearchPensions } from '../src/lib/pensions.js';
import { discoverUniversities } from '../src/lib/payroll.js';
import { writePreparedJson } from '../src/lib/prepared-json.js';

const pensionData = (overrides = {}) => ({
  version: 1,
  identificadorInstitucion: 'prueba',
  institucion: 'Universidad de prueba',
  obligacion: 'Jubilados y pensionados',
  formato: 'Listado de personas jubiladas y pensionadas',
  fuente: { archivo: 'data/pensions/prueba.json', sha256: 'abcdef1234567890' },
  filasEntrada: 2,
  registros: [
    {
      origen: { fila: 1 }, ejercicio: '2026', periodo: { inicio: '2026-01-01', fin: '2026-03-31' },
      estatus: 'Jubilado(a)', tipo: 'Años de Servicio', nombre: { nombres: 'ANA', primerApellido: 'PEREZ', segundoApellido: 'LOPEZ' },
      sexo: 'Mujer', monto: 1200, montoFuente: '1200.00', periodicidad: 'Quincenal', area: 'Recursos Humanos',
      actualizacionFuente: '2026-04-07', nota: 'Fuente original',
    },
    {
      origen: { fila: 2 }, ejercicio: '2026', periodo: { inicio: '2026-01-01', fin: '2026-03-31' },
      estatus: null, tipo: 'Ver nota', nombre: { nombres: null, primerApellido: null, segundoApellido: null },
      sexo: null, monto: null, montoFuente: null, periodicidad: null, area: 'Recursos Humanos',
      actualizacionFuente: '2026-04-07', nota: 'La institución remite al instituto estatal.',
    },
  ],
  ...overrides,
});

test('pension projection creates source-row links and excludes non-person rows', () => {
  const records = toSearchPensions(pensionData());
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'abcdef1234567890-1');
  assert.equal(records[0].nombre, 'ANA PEREZ LOPEZ');
  assert.equal(records[0].nombres, 'ANA');
  assert.equal(records[0].apellidos, 'PEREZ LOPEZ');
  assert.equal(records[0].monto, 1200);
  assert.equal(records[0].montoFuente, '1200.00');
  assert.equal(records[0].periodicidad, 'Quincenal');
  assert.equal(Object.hasOwn(records[0], 'nota'), false);
});

test('pension discovery emits only available datasets from matching directories', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pension-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'prueba');
  await mkdir(directory, { recursive: true });
  await writePreparedJson(path.join(directory, 'pensiones.json'), pensionData());
  const discovered = await discoverPensionDatasets(root);
  assert.deepEqual(discovered.map(({ id, url, records }) => [id, url, records.length]), [
    ['prueba', '/data/pensions/prueba.json', 1],
  ]);
});

test('pension discovery omits datasets containing only anonymous explanatory rows', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pension-notes-only-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'udg');
  await mkdir(directory, { recursive: true });
  const data = pensionData({ identificadorInstitucion: 'udg', registros: [pensionData().registros[1]] });
  await writeFile(path.join(directory, 'pensiones.json'), JSON.stringify(data));
  assert.deepEqual(await discoverPensionDatasets(root), []);
});

test('university discovery can add optional pension URLs only where a prepared dataset matches', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'university-pension-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const id of ['con-pension', 'sin-pension']) {
    const directory = path.join(root, 'payroll', id, '2026');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'nomina.json'), JSON.stringify({
      estado: 'pendiente_revision', identificadorInstitucion: id, anio: '2026', institucion: 'Universidad de prueba',
      fuente: { sha256: 'abcdef1234567890' },
      registros: [{ origen: { fila: 1 }, nombre: { nombres: 'ANA', primerApellido: 'PEREZ', segundoApellido: null },
        puesto: null, cargo: null, area: null, periodo: { inicio: '2026-01-01', fin: '2026-03-31' },
        remuneracionMensual: { bruto: 0, neto: null }, actualizacionFuente: null }],
    }));
  }
  const catalog = await discoverUniversities(path.join(root, 'payroll'));
  const pensionIds = new Set(['con-pension']);
  const withAvailability = catalog.map((university) => ({
    ...university,
    pensionUrl: pensionIds.has(university.id) ? `/data/pensions/${university.id}.json` : null,
  }));
  assert.equal(withAvailability.find(({ id }) => id === 'con-pension').pensionUrl, '/data/pensions/con-pension.json');
  assert.equal(withAvailability.find(({ id }) => id === 'sin-pension').pensionUrl, null);
});
