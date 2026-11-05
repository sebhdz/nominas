import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareEvaluationRows } from '../scripts/evaluaciones/prepare.js';
import { prepareUaaEvaluations } from '../scripts/evaluaciones/index.js';
import { getSearchDataset } from '../src/lib/payroll.js';

function createStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from(content, 'utf8');

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 8); // stored (no compression)
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralSize = centralParts.reduce((acc, buf) => acc + buf.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

test('calculates average score rounded to two decimals when a person appears multiple times', () => {
  const rows = [
    { A: '#', B: 'NOMBRE', C: 'CENTRO', D: 'DEPARTAMENTO', E: 'PUNTOS' },
    { A: '1', B: 'VILA OLMOS  ANNE MARIE CHRISTIANE', C: 'C1', D: 'D1', E: '35.47' },
    { A: '2', B: 'VILA OLMOS ANNE MARIE CHRISTIANE', C: 'C2', D: 'D2', E: '29.19' },
    { A: '3', B: 'HUERTA NAVARRO GIOVANNA', C: 'C1', D: 'D1', E: '38.8' },
    { A: '4', B: 'HUERTA NAVARRO GIOVANNA', C: 'C1', D: 'D2', E: '33.73' },
    { A: '5', B: 'PEÑA PADILLA JESSICA', C: 'C1', D: 'D1', E: '31.07' },
    { E: '33.096277056277053' }, // Trailing summary row without teacher name
  ];

  const result = prepareEvaluationRows(rows, {
    identificadorInstitucion: 'uaa',
    archivo: 'data/evaluations/raw/Evaluacion_Docentes_UAA.xlsx',
    sha256: 'abc123',
  });

  assert.equal(result.identificadorInstitucion, 'uaa');
  assert.equal(result.puntajeMaximo, 40);
  assert.equal(result.filasEntrada, 5);
  assert.equal(result.totalPersonas, 3);
  assert.deepEqual(result.registros, [
    {
      nombre: 'VILA OLMOS ANNE MARIE CHRISTIANE',
      nombreNormalizado: 'VILA OLMOS ANNE MARIE CHRISTIANE',
      calificacion: 32.33,
      evaluaciones: 2,
    },
    {
      nombre: 'HUERTA NAVARRO GIOVANNA',
      nombreNormalizado: 'HUERTA NAVARRO GIOVANNA',
      calificacion: 36.27,
      evaluaciones: 2,
    },
    {
      nombre: 'PEÑA PADILLA JESSICA',
      nombreNormalizado: 'PENA PADILLA JESSICA',
      calificacion: 31.07,
      evaluaciones: 1,
    },
  ]);
});

test('prepareUaaEvaluations writes processed JSON and deletes the original raw XLSX file', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'eval-pipeline-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const rawDir = path.join(root, 'data/evaluations/raw');
  await mkdir(rawDir, { recursive: true });
  const rawFile = path.join(rawDir, 'Evaluacion_Docentes_UAA.xlsx');

  const xlsx = createStoredZip({
    'xl/sharedStrings.xml': '<sst><si><t>NOMBRE</t></si><si><t>PUNTOS</t></si><si><t>PEREZ ANA</t></si></sst>',
    'xl/worksheets/sheet1.xml': [
      '<worksheet><sheetData>',
      '<row r="1"><c r="B1" t="s"><v>0</v></c><c r="E1" t="s"><v>1</v></c></row>',
      '<row r="2"><c r="B2" t="s"><v>2</v></c><c r="E2"><v>38.5</v></c></row>',
      '<row r="3"><c r="B3" t="s"><v>2</v></c><c r="E3"><v>35.5</v></c></row>',
      '</sheetData></worksheet>',
    ].join(''),
  });
  await writeFile(rawFile, xlsx);

  const result = await prepareUaaEvaluations(root);
  assert.equal(result.totalPersonas, 1);
  assert.equal(result.registros[0].calificacion, 37);

  const saved = JSON.parse(await readFile(path.join(root, 'data/evaluations/processed/uaa.json'), 'utf8'));
  assert.deepEqual(saved, result);

  await assert.rejects(access(rawFile), { code: 'ENOENT' });
});

test('processed UAA evaluations JSON is retained without raw XLSX and links into UAA search dataset', async () => {
  const processedJson = await readFile(path.resolve('data/evaluations/processed/uaa.json'), 'utf8');
  const processed = JSON.parse(processedJson);

  assert.equal(processed.totalPersonas, 1941);
  assert.equal(processed.filasEntrada, 2079);
  await assert.rejects(access(path.resolve('data/evaluations/raw/Evaluacion_Docentes_UAA.xlsx')), { code: 'ENOENT' });

  const uaaDataset = await getSearchDataset('uaa', '2026');
  const withEval = uaaDataset.filter((person) => Number.isFinite(person.evaluacion));
  const withoutEval = uaaDataset.filter((person) => !('evaluacion' in person));

  assert.ok(withEval.length > 1600, 'Expected UAA teachers to receive their evaluation score');
  assert.ok(withoutEval.length > 0, 'Expected non-evaluated staff to omit the evaluation field');
});
