import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePensions } from './prepare.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const pensionRoot = path.join(projectRoot, 'data/pensions');
const sourceRoot = path.join(pensionRoot, 'raw');
const outputRoot = path.join(pensionRoot, 'processed');

export async function preparePensionFile(filename, root = projectRoot) {
  const match = /^([a-zA-Z0-9][a-zA-Z0-9_-]*)-pensiones\.json$/i.exec(filename);
  if (!match) throw new Error(`Invalid pension source filename: ${filename}`);
  const id = match[1].toLowerCase();
  const sourcePath = path.join(root, 'data/pensions/raw', filename);
  const bytes = await readFile(sourcePath);
  const raw = JSON.parse(bytes.toString('utf8'));
  const candidate = preparePensions(raw, {
    identificadorInstitucion: id,
    archivo: `data/pensions/raw/${filename}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const outputDirectory = path.join(root, 'data/pensions/processed', id);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, 'pensiones.json'), `${JSON.stringify(candidate, null, 2)}\n`);
  return candidate;
}

export async function runPensionPipeline(root = projectRoot) {
  const directory = path.join(root, 'data/pensions/raw');
  const files = (await readdir(directory)).filter((name) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*-pensiones\.json$/i.test(name)).sort();
  if (!files.length) throw new Error('No pension source JSON files found in data/pensions/raw.');
  for (const filename of files) {
    const candidate = await preparePensionFile(filename, root);
    console.log(`${candidate.identificadorInstitucion}: ${candidate.filasEntrada} rows prepared; ${candidate.fuente.sha256}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPensionPipeline().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
