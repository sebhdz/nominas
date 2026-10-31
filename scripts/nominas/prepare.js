// Header matching tolerates accents, case and whitespace, never column position.
const key = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const campos = {
  ejercicio: 'Ejercicio',
  inicio: 'Fecha de inicio del periodo que se informa',
  fin: 'Fecha de término del periodo que se informa',
  tipo: 'Tipo de integrante del sujeto obligado (catálogo)',
  clave: 'Clave o nivel del puesto',
  puesto: 'Denominación o descripción del puesto (Redactados con perspectiva de género)',
  cargo: 'Denominación del cargo (de conformidad con el nombramiento otorgado)',
  area: 'Área de adscripción',
  nombres: 'Nombre (s)',
  primerApellido: 'Primer apellido',
  segundoApellido: 'Segundo apellido',
  sexo: 'Sexo (catálogo )',
  bruto: 'Monto de la remuneración mensual bruta, de conformidad al Tabulador de sueldos y salarios que corresponda',
  monedaBruto: 'Tipo de moneda de la remuneración mensual bruta',
  neto: 'Monto de la remuneración mensual neta, de conformidad al Tabulador de sueldos y salarios que corresponda',
  monedaNeto: 'Tipo de moneda de la remuneración mensual neta',
  actualizacion: 'Fecha de Actualización',
  nota: 'Nota',
};

// Exact PNT category/field names; categories are optional in older downloads.
export const categoriasAdicionales = [
  ['Percepciones adicionales en dinero', 'las percepciones adicionales en dinero'],
  ['Percepciones adicionales en especie', 'las percepciones adicionales en especie', true],
  ['Ingresos', 'los ingresos'],
  ['Sistemas de compensación', 'los sistemas de compensación'],
  ['Gratificaciones', 'las gratificaciones'],
  ['Primas', 'las primas'],
  ['Comisiones', 'las comisiones'],
  ['Dietas', 'las dietas'],
  ['Bonos', 'los bonos'],
  ['Estímulos', 'los estímulos'],
  ['Apoyos económicos', 'los apoyos económicos'],
  ['Prestaciones económicas', 'las prestaciones económicas'],
  ['Prestaciones en especie', 'las prestaciones en especie', true],
].map(([categoria, complemento, especie = false]) => ({
  categoria,
  columna: especie ? `${categoria} y su periodicidad` : `${categoria}, Monto bruto y neto, tipo de moneda y su periodicidad`,
  especie,
  campos: {
    idFuente: 'ID',
    concepto: `${especie ? 'Descripción' : 'Denominación'} de ${complemento}`,
    periodicidad: `Periodicidad de ${complemento}`,
    ...(!especie && {
      bruto: `Monto bruto de ${complemento}`,
      neto: `Monto neto de ${complemento}`,
      moneda: `Tipo de moneda de ${complemento}`,
    }),
  },
}));

function extractAdditional(row, categories, fila, add) {
  return categories.map(({ definition, index, header }) => {
    const value = row[index];
    const origen = { columna: header };
    if (value === null || value === '') return { categoria: definition.categoria, origen, conceptos: null };
    if (!Array.isArray(value)) {
      add('error', 'subtabla_invalida', fila, header);
      return { categoria: definition.categoria, origen, conceptos: null };
    }
    const conceptos = value.map((item, position) => {
      const fieldPath = `${header}[${position + 1}]`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        add('error', 'concepto_invalido', fila, fieldPath);
        return null;
      }
      const result = { origen: { elemento: position + 1 } };
      const entries = Object.entries(item);
      for (const [field, expected] of Object.entries(definition.campos)) {
        const matches = entries.filter(([name]) => key(name) === key(expected));
        if (matches.length > 1) add('error', 'campo_adicional_ambiguo', fila, `${fieldPath}.${field}`);
        const original = matches[0]?.[1] ?? null;
        if (field === 'bruto' || field === 'neto') {
          result[field] = parseAmount(original);
          result.importesFuente ??= {};
          result.importesFuente[field] = original;
          if (result[field] === null && original !== null && original !== '') {
            add('advertencia', 'importe_adicional_invalido', fila, `${fieldPath}.${field}`);
          }
          if (result[field] !== null && /\.\d{3,}$/.test(String(original).trim())) {
            add('advertencia', 'importe_adicional_mas_de_dos_decimales', fila, `${fieldPath}.${field}`);
          }
        } else {
          result[field] = typeof original === 'string' ? original.trim() || null : null;
          if (original !== null && typeof original !== 'string') {
            add('advertencia', 'texto_adicional_invalido', fila, `${fieldPath}.${field}`);
          }
        }
      }
      return result;
    });
    return { categoria: definition.categoria, origen, conceptos };
  });
}

// Only these source date formats are supported; reject impossible calendar dates.
export function parseDate(value) {
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

export function parseAmount(value) {
  // No separators, currency symbols or exponents. Never round to cents.
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && Number.isSafeInteger(Math.round(number * 100)) ? number : null;
}

export function prepare(raw, source, year) {
  const incidencias = [];
  const add = (nivel, codigo, fila = null, campo = null) => incidencias.push({ nivel, codigo, fila, campo });
  const finish = (registros = []) => {
    const errores = incidencias.filter((item) => item.nivel === 'error').length;
    const conteos = {};
    for (const item of incidencias) conteos[item.codigo] = (conteos[item.codigo] || 0) + 1;
    const estado = errores ? 'bloqueado' : 'pendiente_revision';
    const metadata = { version: 3, estado, institucion: raw?.institucion ?? null, fuente: source };
    const periodos = {};
    const actualizacionesFuente = {};
    for (const registro of registros) {
      const periodo = `${registro.periodo.inicio ?? 'sin fecha'} / ${registro.periodo.fin ?? 'sin fecha'}`;
      periodos[periodo] = (periodos[periodo] || 0) + 1;
      const actualizacion = registro.actualizacionFuente ?? 'sin fecha';
      actualizacionesFuente[actualizacion] = (actualizacionesFuente[actualizacion] || 0) + 1;
    }
    return {
      candidato: { ...metadata, registros },
      reporte: { ...metadata, filasEntrada: Array.isArray(raw?.filas) ? raw.filas.length : 0,
        filasSalida: registros.length, errores, periodos, actualizacionesFuente, conteos, incidencias },
    };
  };

  if (!raw || !Array.isArray(raw.columnas) || !raw.columnas.every((v) => typeof v === 'string') || !Array.isArray(raw.filas)) {
    add('error', 'estructura_invalida');
    return finish();
  }
  if (typeof raw.institucion !== 'string' || !raw.institucion.trim()) add('error', 'institucion_ausente');
  if (!raw.filas.length) add('error', 'archivo_sin_filas');
  const headers = raw.columnas.map(key);
  const indices = {};
  for (const [field, header] of Object.entries(campos)) {
    const matches = headers.flatMap((value, index) => value === key(header) ? [index] : []);
    if (matches.length !== 1) add('error', matches.length ? 'columna_ambigua' : 'columna_ausente', null, field);
    else indices[field] = matches[0];
  }
  const additionalCategories = [];
  for (const definition of categoriasAdicionales) {
    const matches = headers.flatMap((value, index) => value === key(definition.columna) ? [index] : []);
    if (matches.length > 1) add('error', 'columna_ambigua', null, definition.columna);
    else if (matches.length === 1) {
      const index = matches[0];
      additionalCategories.push({ definition, index, header: raw.columnas[index] });
    }
  }
  raw.filas.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== raw.columnas.length) add('error', 'longitud_fila_invalida', i + 1);
  });
  if (incidencias.some((item) => item.nivel === 'error')) return finish();

  const periods = new Set();
  raw.filas.forEach((row, i) => {
    const inicio = parseDate(row[indices.inicio]);
    const fin = parseDate(row[indices.fin]);
    if (!inicio) add('error', 'fecha_periodo_invalida', i + 1, 'inicio');
    if (!fin) add('error', 'fecha_periodo_invalida', i + 1, 'fin');
    if (inicio && fin) {
      periods.add(`${inicio}/${fin}`);
      if (inicio > fin) add('error', 'periodo_invertido', i + 1);
    }
    if (String(row[indices.ejercicio]).trim() !== year ||
        (inicio && inicio.slice(0, 4) !== year) || (fin && fin.slice(0, 4) !== year)) {
      add('error', 'anio_no_coincide', i + 1);
    }
  });
  if (periods.size > 1) add('error', 'multiples_periodos');
  if (incidencias.some((item) => item.nivel === 'error')) return finish();

  const names = new Map();
  const registros = raw.filas.map((row, i) => {
    const fila = i + 1;
    const warn = (code, field = null) => add('advertencia', code, fila, field);
    const text = (field) => {
      const value = row[indices[field]];
      if (value === null || value === '') return null;
      if (typeof value !== 'string') { warn('texto_invalido', field); return null; }
      return value.trim() || null;
    };
    const date = (field) => {
      const result = parseDate(row[indices[field]]);
      if (!result) warn('fecha_ausente_o_invalida', field);
      return result;
    };
    const amount = (field) => {
      const result = parseAmount(row[indices[field]]);
      if (result === null) warn('importe_ausente_o_invalido', field);
      else {
        if (result === 0) warn('importe_cero', field);
        if (result < 0) warn('importe_negativo', field);
        if (/\.\d{3,}$/.test(String(row[indices[field]]).trim())) warn('importe_mas_de_dos_decimales', field);
      }
      return result;
    };
    const nombre = { nombres: text('nombres'), primerApellido: text('primerApellido'), segundoApellido: text('segundoApellido') };
    for (const [field, value] of Object.entries(nombre)) if (!value) warn('componente_nombre_ausente', field);
    // Detect only; do not remove surnames from any source component.
    const given = key(nombre.nombres || '').split(' ');
    for (const field of ['primerApellido', 'segundoApellido']) {
      if (!nombre[field]) continue;
      const surname = key(nombre[field]).split(' ');
      if (given.some((_, start) => surname.every((part, n) => part === given[start + n]))) warn('posible_apellido_en_nombres', field);
    }
    const nameKey = Object.values(nombre).map((v) => key(v || '')).join('|');
    if (Object.values(nombre).some(Boolean)) {
      const group = names.get(nameKey) || [];
      group.push(fila);
      names.set(nameKey, group);
    }
    const periodo = { inicio: date('inicio'), fin: date('fin') };
    const bruto = amount('bruto');
    const neto = amount('neto');
    const monedaBruto = text('monedaBruto');
    const monedaNeto = text('monedaNeto');
    // Keep the original labels: no currency equivalences are established here.
    for (const field of ['monedaBruto', 'monedaNeto']) {
      const value = field === 'monedaBruto' ? monedaBruto : monedaNeto;
      if (!value || !['peso', 'pesos', 'peso mexicano', 'pesos mexicanos', 'mxn'].includes(key(value))) warn('moneda_por_revisar', field);
    }
    if (bruto !== null && neto !== null && neto > bruto) warn('neto_mayor_que_bruto');
    const puesto = text('puesto');
    const cargo = text('cargo');
    const area = text('area');
    for (const [field, value] of Object.entries({ puesto, cargo, area })) if (!value) warn('campo_ausente', field);
    return {
      origen: { fila }, ejercicio: text('ejercicio'), periodo, nombre,
      puesto, cargo, area, clavePuesto: text('clave'), tipoIntegrante: text('tipo'), sexo: text('sexo'),
      remuneracionMensual: { bruto, neto, monedaBruto, monedaNeto },
      percepcionesAdicionales: extractAdditional(row, additionalCategories, fila, add),
      actualizacionFuente: date('actualizacion'), nota: text('nota'),
    };
  });
  for (const group of names.values()) if (group.length > 1) {
    for (const fila of group) add('advertencia', 'nombre_repetido', fila);
  }
  return finish(incidencias.some((item) => item.nivel === 'error') ? [] : registros);
}

export function reportMarkdown(report) {
  const lines = [
    '# Revisión de nómina candidata', '',
    `Estado: **${report.estado}**. Esto no aprueba su publicación.`, '',
    `Archivo: \`${report.fuente.archivo}\``,
    `SHA-256: \`${report.fuente.sha256}\``, '',
    `Filas de entrada: ${report.filasEntrada}. Filas de salida: ${report.filasSalida}. Errores: ${report.errores}.`, '',
    'Las filas se numeran desde 1 dentro del arreglo `filas` del original; no son líneas del archivo.', '',
    '## Periodos informados', '',
    ...Object.entries(report.periodos).map(([period, count]) => `- ${period}: ${count} registros.`), '',
    '## Actualizaciones en la fuente', '',
    ...Object.entries(report.actualizacionesFuente).map(([date, count]) => `- ${date}: ${count} registros.`), '',
    '## Incidencias', '',
    '| Incidencia | Cantidad |', '| --- | ---: |',
    ...Object.entries(report.conteos).map(([code, count]) => `| ${code} | ${count} |`), '',
    'El JSON del reporte contiene todas las incidencias y sus filas/campos. Los datos candidatos conservan registros separados, ceros, notas y monedas sin equivalencias. Las percepciones y prestaciones adicionales se conservan por categoría y concepto, sin sumarlas ni convertir su periodicidad.', '',
  ];
  return lines.join('\n');
}
