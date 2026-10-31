import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readPreparedJson, writePreparedJson } from '../src/lib/prepared-json.js';

async function location(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'prepared-json-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return path.join(directory, 'nomina.json');
}

test('gzip preserves prepared data and reproducibility, replacing only the old JSON artifact', async t => {
  const file = await location(t);
  const data = { nombre: 'María  Pérez', importes: [0, -12.5, 123.4567, null], nota: ' N/A ' };
  await writeFile(file, JSON.stringify({ previous: true }));
  await writePreparedJson(file, data);
  const bytes = await readFile(`${file}.gz`);
  assert.deepEqual(JSON.parse(gunzipSync(bytes)), data);
  assert.deepEqual(await readPreparedJson(file), data);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
  await writePreparedJson(file, data);
  assert.deepEqual(await readFile(`${file}.gz`), bytes);
});

test('legacy JSON is readable but a corrupt gzip never silently falls back to stale data', async t => {
  const file = await location(t);
  await writeFile(file, '{"legacy":true}');
  assert.deepEqual(await readPreparedJson(file), { legacy: true });
  await writeFile(`${file}.gz`, 'corrupt');
  await assert.rejects(readPreparedJson(file));
});
