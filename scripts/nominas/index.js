import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepare, reportMarkdown } from './prepare.js';
import { writePreparedJson } from '../../src/lib/prepared-json.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const validInstitution = (id) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id);
const visibleEntries = async (directory) => (await readdir(directory, { withFileTypes: true }))
  .filter((entry) => !entry.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));

export async function prepareYear(id, year, root = projectRoot) {
  if (!validInstitution(id) || !/^\d{4}$/.test(year)) throw new Error('Invalid university identifier or year.');
  const inputDirectory = `data/raw/${id}/${year}`;
  const source = { archivo: inputDirectory, sha256: null };
  let raw;
  let inputError;
  try {
    const entries = await visibleEntries(path.join(root, inputDirectory));
    if (entries.length !== 1 || !entries[0].isFile() || !/\.json$/i.test(entries[0].name)) {
      inputError = 'archivo_unico_requerido';
    } else {
      source.archivo += `/${entries[0].name}`;
      const buffer = await readFile(path.join(root, source.archivo));
      source.sha256 = createHash('sha256').update(buffer).digest('hex');
      raw = JSON.parse(buffer.toString('utf8'));
    }
  } catch (error) {
    inputError = error instanceof SyntaxError ? 'json_invalido' : 'archivo_no_legible';
  }
  const result = prepare(raw, source, year);
  if (inputError) {
    result.reporte.incidencias = [{ nivel: 'error', codigo: inputError, fila: null, campo: null }];
    result.reporte.conteos = { [inputError]: 1 };
  }
  for (const output of [result.candidato, result.reporte]) {
    output.identificadorInstitucion = id;
    output.anio = year;
  }
  const processed = path.join(root, 'data/processed', id, year);
  const reports = path.join(root, 'data/reports', id, year);
  await mkdir(processed, { recursive: true });
  await mkdir(reports, { recursive: true });
  // A failed run replaces any previous candidate with an empty blocked result.
  await writePreparedJson(path.join(processed, 'nomina.json'), result.candidato);
  await writeFile(path.join(reports, 'revision.json'), JSON.stringify(result.reporte) + '\n');
  await writeFile(path.join(reports, 'revision.md'), reportMarkdown(result.reporte));
  return result.reporte;
}

export async function runPipeline(institution = null, root = projectRoot, log = console.log) {
  if (institution !== null && !validInstitution(institution)) throw new Error('Use an identifier without spaces: ASCII letters, numbers, hyphens, or underscores.');
  const rawRoot = path.join(root, 'data/raw');
  const entries = await visibleEntries(rawRoot);
  const selected = institution === null ? entries : entries.filter((entry) => entry.name === institution);
  if (!selected.length) throw new Error('No matching universities found in data/raw.');
  let failed = false;
  for (const entry of selected) {
    try {
      if (!entry.isDirectory() || !validInstitution(entry.name)) throw new Error(`Invalid entry in data/raw: ${entry.name}. Use university directories without spaces.`);
      const years = await visibleEntries(path.join(rawRoot, entry.name));
      if (!years.length) throw new Error(`${entry.name}: no year directories found.`);
      for (const year of years) {
        if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) {
          log(`${entry.name}: invalid entry ${year.name}; expected a four-digit year directory.`);
          failed = true;
          continue;
        }
        const report = await prepareYear(entry.name, year.name, root);
        log(`${entry.name}/${year.name}: ${report.estado}; ${report.filasSalida}/${report.filasEntrada} records; ${report.incidencias.length} findings. See data/reports/${entry.name}/${year.name}/revision.md`);
        if (report.errores) failed = true;
      }
    } catch (error) {
      log(error.message);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: npm run nominas:prepare -- --university <id>\n       npm run nominas:prepare -- --all\nInput: data/raw/<id>/<year>/<file>.json. Processes every year under each selected university.');
  } else if (args.length === 1 && args[0] === '--all') {
    process.exitCode = await runPipeline();
  } else if (args.length === 2 && args[0] === '--university') {
    process.exitCode = await runPipeline(args[1]);
  } else {
    throw new Error('Select --university <id> or --all. See --help.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
