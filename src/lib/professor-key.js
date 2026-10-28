export function getProfessorKey(universityId, fullName) {
  const uni = String(universityId || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const name = String(fullName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!uni && !name) return 'desconocido';
  if (!uni) return name;
  if (!name) return uni;
  return `${uni}:${name}`;
}
