import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const processedRoot = path.resolve('data/pensions/processed');

export function toSearchPensions(data) {
  return data.registros.flatMap((record) => {
    const names = record.nombre.nombres || '';
    const surnames = [record.nombre.primerApellido, record.nombre.segundoApellido].filter(Boolean).join(' ');
    const nombre = [names, surnames].filter(Boolean).join(' ').trim();
    if (!nombre) return [];
    return [{
      id: `${data.fuente.sha256.slice(0, 16)}-${record.origen.fila}`,
      nombre,
      area: record.area,
      estatus: record.estatus,
      tipo: record.tipo,
      monto: record.monto,
      montoFuente: record.montoFuente,
      periodicidad: record.periodicidad,
      periodo: record.periodo,
      actualizacion: record.actualizacionFuente,
    }];
  });
}

export function pensionNotes(data) {
  return [...new Set(data.registros.map((record) => record.nota?.trim()).filter(Boolean))];
}

export async function readPensions(file) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  if (!data.institucion?.trim() || !data.identificadorInstitucion || !data.fuente?.sha256 || !Array.isArray(data.registros)) {
    throw new Error(`Invalid prepared pensions: ${file}`);
  }
  return data;
}

export async function discoverPensionDatasets(root = processedRoot) {
  const datasets = [];
  for (const institution of await readdir(root, { withFileTypes: true })) {
    if (!institution.isDirectory() || institution.name.startsWith('.')) continue;
    const file = path.join(root, institution.name, 'pensiones.json');
    const data = await readPensions(file);
    if (data.identificadorInstitucion !== institution.name) throw new Error(`Prepared pensions do not match their directory: ${file}`);
    const records = toSearchPensions(data);
    if (!records.length) continue;
    datasets.push({
      id: institution.name,
      url: `/data/pensions/${institution.name}.json`,
      records,
      notes: pensionNotes(data),
    });
  }
  return datasets.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getSearchPensions(id) {
  const data = await readPensions(path.join(processedRoot, id, 'pensiones.json'));
  return toSearchPensions(data);
}
