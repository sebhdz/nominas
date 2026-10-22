export const AVAILABLE_YEARS = ['2026', '2025', '2024', '2023', '2022'];
export const DEFAULT_YEAR = '2026';

export function parsePayrollJSON(raw) {
  return JSON.parse(String(raw).replace(/:\s*NaN\b/g, ': null'));
}

export function toPeople(records) {
  const latestByEmployee = new Map();
  for (const record of records) {
    const previous = latestByEmployee.get(record.id_empleado);
    if (!previous || String(record.periodo_inicio ?? '') >= String(previous.periodo_inicio ?? '')) {
      latestByEmployee.set(record.id_empleado, record);
    }
  }
  return Array.from(latestByEmployee.values(), record => ({
    id: record.id_empleado,
    nombre: record.nombre_completo,
    nombres: record.nombre,
    apellidos: [record.primer_apellido, record.segundo_apellido]
      .filter(Boolean)
      .join(' '),
    puesto: record.denominacion_cargo,
    puesto_base: record.descripcion_puesto,
    area: record.area_adscripcion,
    bruto: record.remuneracion_bruta_mensual,
    neto: record.remuneracion_neta_mensual,
  }));
}

export function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function isProfessor(person) {
  return /^(prof\.|profesor)/.test(normalize(person.puesto_base || person.puesto));
}

export function findPeople(records, query, { area = '', group = 'all', order = 'desc' } = {}) {
  const phrase = normalize(query);
  const terms = phrase.split(/\s+/).filter(Boolean);
  return records.filter(person => {
    if (area && person.area !== area) return false;
    if (group === 'professors' && !isProfessor(person)) return false;
    if (group === 'others' && isProfessor(person)) return false;
    const text = normalize(`${person.nombre} ${person.area} ${person.puesto} ${person.puesto_base || ''}`);
    return terms.every(term => text.includes(term));
  }).sort((a, b) => (order === 'asc' ? a.bruto - b.bruto : b.bruto - a.bruto) || a.nombre.localeCompare(b.nombre, 'es'));
}
