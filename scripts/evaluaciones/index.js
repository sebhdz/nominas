import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareEvaluationsFromXlsx } from './prepare.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

export async function prepareUaaEvaluations(root = projectRoot) {
  const relativeSource = 'data/evaluations/raw/Evaluacion_Docentes_UAA.xlsx';
  const sourcePath = path.join(root, relativeSource);
  const bytes = await readFile(sourcePath);
  const processed = prepareEvaluationsFromXlsx(bytes, {
    identificadorInstitucion: 'uaa',
    archivo: relativeSource,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const outputDirectory = path.join(root, 'data/evaluations/processed');
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, 'uaa.json');
  await writeFile(outputPath, `${JSON.stringify(processed, null, 2)}\n`, 'utf8');
  await unlink(sourcePath);
  return processed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareUaaEvaluations()
    .then((result) => {
      console.log(
        `${result.identificadorInstitucion}: ${result.filasEntrada} rows -> ${result.totalPersonas} people prepared; ${result.fuente.sha256}`
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
