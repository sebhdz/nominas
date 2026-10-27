const fields = {
  ejercicio: ['Ejercicio'],
  inicio: ['Fecha de inicio del periodo que se informa'],
  fin: ['Fecha de término del periodo que se informa'],
  estatus: ['Estatus (catálogo)'],
  tipo: ['Tipo de jubilación o pensión'],
  nombres: ['Nombre(s)'],
  primerApellido: ['Primer apellido'],
  segundoApellido: ['Segundo apellido'],
  sexo: ['Sexo (catálogo)'],
  monto: ['Monto de la porción de su pensión que recibe directamente del Estado Mexicano'],
  periodicidad: ['Periodicidad del monto recibido'],
  area: [
    'Área(s) responsable(s) que genera(n), posee(n), publica(n) y actualizan la información',
    'Área(s) responsable(s) que genera(n), posee(n), publica(n) y actualiza(n) la información',
  ],
  actualizacion: ['Fecha de Actualización'],
  nota: ['Nota'],
};

const normalize = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function parsePensionDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?: 00:00:00)?$/.exec(text);
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!iso && !local) return null;
  const [, year, month, day] = iso || [null, local[3], local[2], local[1]];
  const result = `${year}-${month}-${day}`;
  const date = new Date(`${result}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === result ? result : null;
}

function sourceText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function sourceDate(value) {
  const original = sourceText(value);
  return { fecha: parsePensionDate(original), fechaFuente: original };
}

function sourceAmount(value) {
  const original = sourceText(value);
  if (original === null || !/^-?\d+(?:\.\d+)?$/.test(original)) {
    return { monto: null, montoFuente: original };
  }
  const amount = Number(original);
  return Number.isFinite(amount) ? { monto: amount, montoFuente: original } : { monto: null, montoFuente: original };
}

export function preparePensions(raw, source) {
  if (!raw || typeof raw.institucion !== 'string' || !raw.institucion.trim() || !Array.isArray(raw.columnas) || !raw.columnas.every((value) => typeof value === 'string') || !Array.isArray(raw.filas)) {
    throw new Error('Invalid PNT pension document structure.');
  }

  const headers = raw.columnas.map(normalize);
  const indices = {};
  for (const [field, candidates] of Object.entries(fields)) {
    const matches = headers.flatMap((header, index) => candidates.some((candidate) => normalize(candidate) === header) ? [index] : []);
    if (matches.length !== 1) throw new Error(`Expected exactly one source column for ${field}.`);
    indices[field] = matches[0];
  }
  raw.filas.forEach((row, index) => {
    if (!Array.isArray(row) || row.length !== raw.columnas.length) throw new Error(`Invalid source row length at row ${index + 1}.`);
  });

  const registros = raw.filas.map((row, index) => {
    const inicio = sourceDate(row[indices.inicio]);
    const fin = sourceDate(row[indices.fin]);
    const actualizacion = sourceDate(row[indices.actualizacion]);
    const amount = sourceAmount(row[indices.monto]);
    return {
      origen: { fila: index + 1 },
      ejercicio: sourceText(row[indices.ejercicio]),
      periodo: {
        inicio: inicio.fecha,
        inicioFuente: inicio.fechaFuente,
        fin: fin.fecha,
        finFuente: fin.fechaFuente,
      },
      estatus: sourceText(row[indices.estatus]),
      tipo: sourceText(row[indices.tipo]),
      nombre: {
        nombres: sourceText(row[indices.nombres]),
        primerApellido: sourceText(row[indices.primerApellido]),
        segundoApellido: sourceText(row[indices.segundoApellido]),
      },
      sexo: sourceText(row[indices.sexo]),
      monto: amount.monto,
      montoFuente: amount.montoFuente,
      periodicidad: sourceText(row[indices.periodicidad]),
      area: sourceText(row[indices.area]),
      actualizacionFuente: actualizacion.fecha,
      actualizacionOriginal: actualizacion.fechaFuente,
      nota: sourceText(row[indices.nota]),
    };
  });

  return {
    version: 1,
    identificadorInstitucion: source.identificadorInstitucion,
    institucion: raw.institucion,
    obligacion: sourceText(raw.obligacion),
    formato: sourceText(raw.formato),
    fuente: {
      archivo: source.archivo,
      sha256: source.sha256,
    },
    filasEntrada: raw.filas.length,
    registros,
  };
}
