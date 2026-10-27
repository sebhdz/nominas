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
  }).sort((a, b) => {
    if (a.bruto === null && b.bruto !== null) return 1;
    if (b.bruto === null && a.bruto !== null) return -1;
    return (order === 'asc' ? a.bruto - b.bruto : b.bruto - a.bruto) || a.nombre.localeCompare(b.nombre, 'es');
  });
}

export function findPensioners(records, query, { area = '', type = '', status = '', order = 'desc' } = {}) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return records.filter(person => {
    if (area && person.area !== area) return false;
    if (type && person.tipo !== type) return false;
    if (status && person.estatus !== status) return false;
    const text = normalize(`${person.nombre} ${person.area} ${person.tipo} ${person.estatus} ${person.nota}`);
    return terms.every(term => text.includes(term));
  }).sort((a, b) => {
    if (a.monto === null && b.monto !== null) return 1;
    if (b.monto === null && a.monto !== null) return -1;
    return (order === 'asc' ? a.monto - b.monto : b.monto - a.monto) || a.nombre.localeCompare(b.nombre, 'es');
  });
}
