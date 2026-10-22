import { AVAILABLE_YEARS, DEFAULT_YEAR, findPeople } from './search-utils.js';

const $ = selector => document.querySelector(selector);
const search = $('#search');
const results = $('#results');
const status = $('#status');
const dialog = $('#person-dialog');
const year = $('#year');
const area = $('#area');
const order = $('#order');
let group = 'all';
const reset = $('#reset');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const PAGE_SIZE = 10;
const YEAR_META = {
  '2026': { footer: 'Abril–junio 2026', dialog: 'UAA · ABRIL—JUNIO 2026', updated: 'Información pública · Actualizada el 2 jul 2026' },
  '2025': { footer: 'Ejercicio 2025', dialog: 'UAA · EJERCICIO 2025', updated: 'Información pública · Actualizada el 7 ene 2026' },
  '2024': { footer: 'Ejercicio 2024', dialog: 'UAA · EJERCICIO 2024', updated: 'Información pública · Actualizada el 10 ene 2025' },
  '2023': { footer: 'Ejercicio 2023', dialog: 'UAA · EJERCICIO 2023', updated: 'Información pública · Actualizada el 15 ene 2024' },
  '2022': { footer: 'Ejercicio 2022', dialog: 'UAA · EJERCICIO 2022', updated: 'Información pública · Actualizada el 6 ene 2023' },
};
const cache = new Map();
let activeYear = DEFAULT_YEAR;
let people = [];
let matches = [];
let page = 1;
let selected = null;
let ready = false;
let searchTimer;
let lastTrigger = null;
let loadToken = 0;

function selectedYear() {
  return AVAILABLE_YEARS.includes(year.value) ? year.value : DEFAULT_YEAR;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function queryURL() {
  const url = new URL(location.href);
  const values = {
    anio: activeYear !== DEFAULT_YEAR ? activeYear : '',
    q: search.value.trim(),
    area: area.value,
    grupo: group === 'all' ? '' : group,
    orden: order.value === 'asc' ? 'menor' : '',
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return url;
}

function updateYearLabels(targetYear) {
  const meta = YEAR_META[targetYear] || YEAR_META[DEFAULT_YEAR];
  $('#footer-period').textContent = meta.footer;
  $('#person-period').textContent = meta.dialog;
  $('#person-updated').textContent = meta.updated;
  $('#download-link').href = `/data/sueldo-${targetYear}.json`;
}

function populateAreas(desiredArea = area.value) {
  const areas = [...new Set(people.map(person => person.area))].sort((a, b) => a.localeCompare(b, 'es'));
  area.replaceChildren(element('option', '', 'Todas las áreas'));
  area.firstElementChild.value = '';
  for (const name of areas) {
    const option = element('option', '', readableLabel(name));
    option.value = name;
    area.append(option);
  }
  area.value = areas.includes(desiredArea) ? desiredArea : '';
  area.disabled = false;
}

function readableName(value) {
  const particles = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
  return value.trim().split(/\s+/).map((word, index) => {
    const lower = word.toLocaleLowerCase('es-MX');
    if (index > 0 && particles.has(lower)) return lower;
    return lower.replace(/(^|-)\p{L}/gu, letter => letter.toLocaleUpperCase('es-MX'));
  }).join(' ');
}

function readableLabel(value) {
  const text = value.toLocaleLowerCase('es-MX');
  return text.charAt(0).toLocaleUpperCase('es-MX') + text.slice(1);
}

function renderResults() {
  results.replaceChildren();
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  page = Math.min(page, pages);
  const offset = (page - 1) * PAGE_SIZE;
  const shown = matches.slice(offset, offset + PAGE_SIZE);
  if (!matches.length) {
    const row = element('tr');
    const empty = element('td', 'empty-message');
    empty.colSpan = 4;
    empty.append(element('h3', '', 'No encontramos coincidencias.'), element('p', '', 'Prueba con un apellido o limpia los filtros.'));
    row.append(empty);
    results.append(row);
  }
  for (const person of shown) {
    const row = element('tr');
    const nameCell = element('td', 'name-cell');
    const button = element('button', 'person-link');
    button.append(element('span', 'name-line', readableName(person.nombres)), element('span', 'name-line', readableName(person.apellidos)));
    button.title = readableName(person.nombre);
    button.type = 'button';
    button.setAttribute('aria-label', `Ver sueldo de ${person.nombre}`);
    button.addEventListener('click', () => openPerson(person, button));
    nameCell.append(button);
    const role = element('td', 'role-cell', readableLabel(person.puesto));
    const areaCell = element('td', 'area-cell', readableLabel(person.area));
    const salary = element('td', 'salary-cell');
    salary.append(element('span', 'gross-value', money.format(person.bruto)), element('span', 'salary-label-small', 'Bruto mensual'), element('span', 'net-value', `${money.format(person.neto)} neto`));
    row.append(nameCell, role, areaCell, salary);
    results.append(row);
  }
  status.textContent = `Mostrando ${shown.length ? offset + 1 : 0}–${offset + shown.length} de ${matches.length.toLocaleString('es-MX')} registros`;
  $('#pagination').hidden = pages <= 1;
  $('#page-label').textContent = `Página ${page} de ${pages}`;
  $('#previous-page').disabled = page <= 1;
  $('#next-page').disabled = page >= pages;
  results.setAttribute('aria-busy', 'false');
}

function runSearch({ updateURL = true } = {}) {
  if (!ready) return;
  clearTimeout(searchTimer);
  page = 1;
  matches = findPeople(people, search.value, { area: area.value, group, order: order.value });
  reset.hidden = !search.value && !area.value && group === 'all' && order.value === 'desc' && !year.value;
  $('.sort-note').textContent = `Ordenado por sueldo bruto, de ${order.value === 'asc' ? 'menor a mayor' : 'mayor a menor'} · MXN`;
  renderResults();
  if (updateURL) {
    const url = queryURL();
    url.searchParams.delete('persona');
    history.replaceState(null, '', url);
  }
}

function openPerson(person, trigger = search, updateURL = true) {
  selected = person;
  lastTrigger = trigger;
  $('#person-name').textContent = readableName(person.nombre);
  $('#person-role').textContent = readableLabel(person.puesto);
  $('#person-area').textContent = readableLabel(person.area);
  $('#person-gross').textContent = money.format(person.bruto);
  $('#person-net').textContent = money.format(person.neto);
  $('#zero-note').hidden = person.neto !== 0;
  $('#share-status').textContent = '';
  if (updateURL) {
    const url = queryURL();
    url.searchParams.set('persona', person.id);
    history.pushState(null, '', url);
  }
  if (!dialog.open) dialog.showModal();
}

dialog.addEventListener('close', () => {
  if (dialog.open) return;
  selected = null;
  const url = new URL(location.href);
  url.searchParams.delete('persona');
  history.replaceState(null, '', url);
  if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
});
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});
search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 120);
});
$('#search-form').addEventListener('submit', event => { event.preventDefault(); runSearch(); });
year.addEventListener('change', () => { loadYear(selectedYear(), { updateURL: true }); });
area.addEventListener('change', () => runSearch());
order.addEventListener('change', () => runSearch());
function setGroup(value) {
  group = value;
  document.querySelectorAll('[data-group]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.group === group)));
}
for (const button of document.querySelectorAll('[data-group]')) {
  button.addEventListener('click', () => { setGroup(button.dataset.group); runSearch(); });
}
reset.addEventListener('click', () => {
  search.value = area.value = year.value = '';
  order.value = 'desc';
  setGroup('all');
  loadYear(DEFAULT_YEAR, { updateURL: true, desiredArea: '' });
  search.focus();
});
for (const [selector, change] of [['#previous-page', -1], ['#next-page', 1]]) {
  $(selector).addEventListener('click', () => {
    page += change;
    renderResults();
    results.querySelector('button')?.focus({ preventScroll: true });
    $('.browse').scrollIntoView({ block: 'start' });
  });
}
$('#share-person').addEventListener('click', async () => {
  if (!selected) return;
  const url = queryURL();
  url.searchParams.set('persona', selected.id);
  const shareStatus = $('#share-status');
  try {
    await navigator.clipboard.writeText(url.href);
    shareStatus.textContent = 'Enlace copiado.';
  } catch {
    shareStatus.replaceChildren(element('span', '', 'Copia este enlace: '));
    const input = element('input');
    input.type = 'url';
    input.value = url.href;
    input.readOnly = true;
    input.setAttribute('aria-label', 'Enlace a esta persona');
    shareStatus.append(input);
    input.focus();
    input.select();
  }
});
$('#dialog-source').addEventListener('click', () => { dialog.close(); $('#fuente').classList.add('is-open'); });

async function loadYear(targetYear, { updateURL = true, desiredArea = area.value, restorePersonId = null } = {}) {
  const token = ++loadToken;
  if (!cache.has(targetYear)) {
    ready = false;
    results.setAttribute('aria-busy', 'true');
    status.textContent = 'Cargando los datos públicos…';
  }
  try {
    if (!cache.has(targetYear)) {
      const response = await fetch(`/data/${targetYear}/buscador.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) throw new Error('Archivo vacío');
      cache.set(targetYear, data);
    }
    if (token !== loadToken) return;
    activeYear = targetYear;
    people = cache.get(targetYear);
    updateYearLabels(activeYear);
    populateAreas(desiredArea);
    ready = true;
    runSearch({ updateURL });
    if (restorePersonId !== null) {
      const person = people.find(item => String(item.id) === restorePersonId);
      if (person) openPerson(person, search, false);
      else if (dialog.open) dialog.close();
      if (restorePersonId && !person) status.textContent = 'Esa persona no aparece en este archivo. Puedes buscar por su nombre.';
    }
  } catch {
    if (token !== loadToken) return;
    results.setAttribute('aria-busy', 'false');
    status.replaceChildren(element('span', '', 'No pudimos cargar los datos. '));
    const retry = element('button', 'text-button', 'Volver a intentar');
    retry.type = 'button';
    retry.addEventListener('click', () => { loadYear(targetYear, { updateURL, desiredArea, restorePersonId }); });
    status.append(retry);
  }
}

function restoreLocation() {
  const url = new URL(location.href);
  const requestedYear = url.searchParams.get('anio');
  year.value = AVAILABLE_YEARS.includes(requestedYear) ? requestedYear : '';
  search.value = url.searchParams.get('q') || '';
  const desiredArea = url.searchParams.get('area') || '';
  const requestedGroup = url.searchParams.get('grupo');
  order.value = url.searchParams.get('orden') === 'menor' ? 'asc' : 'desc';
  setGroup(['professors', 'others'].includes(requestedGroup) ? requestedGroup : 'all');
  const id = url.searchParams.get('persona');
  loadYear(selectedYear(), { updateURL: false, desiredArea, restorePersonId: id });
}
window.addEventListener('popstate', restoreLocation);
restoreLocation();

