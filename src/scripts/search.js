import { findPeople, normalize } from './search-utils.js';
import { loadPerception, resetPerception, setupPerceptionListeners } from './votes.js';

const $ = selector => document.querySelector(selector);
const search = $('#search');
const results = $('#results');
const status = $('#status');
const dialog = $('#person-dialog');
const area = $('#area');
const areaInput = $('#area-input');
const areaList = $('#area-list');
let areas = [];
let areaOptions = [];
let activeArea = -1;
const order = $('#order');
let group = 'all';
const reset = $('#reset');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const PAGE_SIZE = 15;
let people = [];
let matches = [];
let page = 1;
let selected = null;
let ready = false;
let searchTimer;
let lastTrigger = null;
let pendingArea = '';
let university;
const formatMoney = value => Number.isFinite(value) ? money.format(value) : 'Sin dato';
const formatDate = value => value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Sin fecha';
const formatPeriod = period => `${formatDate(period.inicio)} – ${formatDate(period.fin)}`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function queryURL() {
  const url = new URL(location.href);
  const values = { q: search.value.trim(), area: ready ? area.value : pendingArea, grupo: group === 'all' ? '' : group, orden: order.value === 'asc' ? 'menor' : '' };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return url;
}

function readableName(value) {
  const particles = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
  return (value || '').trim().split(/\s+/).map((word, index) => {
    const lower = word.toLocaleLowerCase('es-MX');
    if (index > 0 && particles.has(lower)) return lower;
    return lower.replace(/(^|-)\p{L}/gu, letter => letter.toLocaleUpperCase('es-MX'));
  }).join(' ');
}

function readableLabel(value) {
  if (!value) return 'Sin dato';
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
    salary.append(element('span', 'gross-value', formatMoney(person.bruto)), element('span', 'salary-label-small', 'Bruto mensual'), element('span', 'net-value', `${formatMoney(person.neto)} neto`));
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
  clearTimeout(searchTimer);
  if (updateURL) {
    const url = queryURL();
    url.searchParams.delete('persona');
    history.replaceState(null, '', url);
  }
  if (!ready) return;
  page = 1;
  matches = findPeople(people, search.value, { area: area.value, group, order: order.value });
  reset.hidden = !search.value && !area.value && group === 'all' && order.value === 'desc';
  $('.sort-note').textContent = `Ordenado por sueldo bruto, de ${order.value === 'asc' ? 'menor a mayor' : 'mayor a menor'} · MXN`;
  renderResults();
}

function openPerson(person, trigger = search, updateURL = true) {
  selected = person;
  lastTrigger = trigger;
  $('#person-name').textContent = readableName(person.nombre);
  $('#person-role').textContent = readableLabel(person.puesto);
  $('#person-area').textContent = readableLabel(person.area);
  $('#person-gross').textContent = formatMoney(person.bruto);
  $('#person-net').textContent = formatMoney(person.neto);
  $('#person-period').textContent = `${university.name} · ${formatPeriod(university.period)}`;
  $('#person-source-date').textContent = `Actualización en la fuente: ${formatDate(person.actualizacion)}`;
  $('#share-status').textContent = '';
  if (updateURL) {
    const url = queryURL();
    url.searchParams.set('persona', person.id);
    history.pushState(null, '', url);
  }
  if (!dialog.open) dialog.showModal();
  loadPerception(university.id, person.nombre);
}

dialog.addEventListener('close', () => {
  if (dialog.open) return;
  resetPerception();
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
  if (!ready) {
    runSearch();
    return;
  }
  searchTimer = setTimeout(runSearch, 120);
});
$('#search-form').addEventListener('submit', event => { event.preventDefault(); runSearch(); });
function chooseArea(value) {
  area.value = value;
  areaInput.value = value ? readableLabel(value) : '';
  closeAreas();
  runSearch();
}

function highlightArea(index) {
  areaOptions[activeArea]?.setAttribute('aria-selected', 'false');
  activeArea = index;
  const option = areaOptions[index];
  if (!option) return areaInput.removeAttribute('aria-activedescendant');
  option.setAttribute('aria-selected', 'true');
  areaInput.setAttribute('aria-activedescendant', option.id);
  option.scrollIntoView({ block: 'nearest' });
}

function openAreas() {
  // Si el texto es el área ya elegida, se muestra la lista completa.
  const typed = areaInput.value === (area.value ? readableLabel(area.value) : '') ? '' : normalize(areaInput.value);
  const names = ['', ...areas.filter(name => normalize(name).includes(typed))];
  areaOptions = names.map((name, index) => {
    const option = element('li', 'area-option', name ? readableLabel(name) : 'Todas las áreas');
    option.id = `area-option-${index}`;
    option.dataset.area = name;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.addEventListener('mousedown', event => { event.preventDefault(); chooseArea(name); });
    return option;
  });
  if (names.length === 1) areaOptions.push(element('li', 'area-empty', 'Sin coincidencias'));
  areaList.replaceChildren(...areaOptions);
  areaOptions = areaOptions.filter(option => option.id);
  activeArea = -1;
  areaInput.removeAttribute('aria-activedescendant');
  areaList.hidden = false;
  areaInput.setAttribute('aria-expanded', 'true');
}

function closeAreas() {
  areaList.hidden = true;
  areaInput.setAttribute('aria-expanded', 'false');
  areaInput.removeAttribute('aria-activedescendant');
}

areaInput.addEventListener('click', openAreas);
areaInput.addEventListener('focus', openAreas);
areaInput.addEventListener('input', openAreas);
areaInput.addEventListener('blur', () => {
  closeAreas();
  areaInput.value = area.value ? readableLabel(area.value) : '';
});
areaInput.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (areaList.hidden) openAreas();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    highlightArea((activeArea + step + areaOptions.length) % areaOptions.length);
  } else if (event.key === 'Enter' && !areaList.hidden) {
    event.preventDefault();
    const index = activeArea >= 0 ? activeArea : (areaOptions.length > 1 ? 1 : 0);
    chooseArea(areaOptions[index].dataset.area);
  } else if (event.key === 'Escape' && !areaList.hidden) {
    event.preventDefault();
    closeAreas();
  }
});
order.addEventListener('change', () => runSearch());
function setGroup(value) {
  group = value;
  document.querySelectorAll('[data-group]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.group === group)));
}
for (const button of document.querySelectorAll('[data-group]')) {
  button.addEventListener('click', () => { setGroup(button.dataset.group); runSearch(); });
}
reset.addEventListener('click', () => {
  search.value = area.value = areaInput.value = '';
  pendingArea = '';
  order.value = 'desc';
  setGroup('all');
  runSearch();
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

function setArea(value) {
  area.value = areas.includes(value) ? value : '';
  areaInput.value = area.value ? readableLabel(area.value) : '';
}

function restoreLocation() {
  const url = new URL(location.href);
  search.value = url.searchParams.get('q') || '';
  pendingArea = url.searchParams.get('area') || '';
  if (ready) setArea(pendingArea);
  const requestedGroup = url.searchParams.get('grupo');
  order.value = url.searchParams.get('orden') === 'menor' ? 'asc' : 'desc';
  setGroup(['professors', 'others'].includes(requestedGroup) ? requestedGroup : 'all');
  runSearch({ updateURL: false });
  if (ready) restorePerson();
}

function restorePerson() {
  const url = new URL(location.href);
  const id = url.searchParams.get('persona');
  const person = people.find(item => String(item.id) === id);
  if (person) openPerson(person, search, false);
  else if (dialog.open) dialog.close();
  if (id && !person) status.textContent = 'Esa persona no aparece en este archivo. Puedes buscar por su nombre.';
}
window.addEventListener('popstate', restoreLocation);

async function loadData() {
  try {
    const catalogResponse = await fetch('/data/universities.json');
    if (!catalogResponse.ok) throw new Error(`HTTP ${catalogResponse.status}`);
    const catalog = await catalogResponse.json();
    const id = new URL(location.href).searchParams.get('university');
    university = catalog.find(item => item.id === id);
    if (!university) {
      $('#payroll-search').hidden = true;
      $('#payroll-results').hidden = true;
      $('#university-error').textContent = id ? 'Esa universidad no está disponible. Elige otra desde el directorio.' : 'Elige una universidad desde el directorio para consultar su nómina.';
      $('#university-error').hidden = false;
      return;
    }
    const title = `Nómina ${university.name}`;
    document.title = `${title} · ¿Cuánto gana mi profe?`;
    $('#university-name').textContent = title;
    const response = await fetch(university.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    people = await response.json();
    if (!Array.isArray(people) || !people.length) throw new Error('Archivo vacío');
    areas = [...new Set(people.map(person => person.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    areaInput.disabled = false;
    setArea(pendingArea);
    ready = true;
    runSearch({ updateURL: false });
    restorePerson();
  } catch {
    results.setAttribute('aria-busy', 'false');
    status.replaceChildren(element('span', '', 'No pudimos cargar los datos. '));
    const retry = element('button', 'text-button', 'Volver a intentar');
    retry.type = 'button';
    retry.addEventListener('click', () => { status.textContent = 'Cargando los datos públicos…'; loadData(); });
    status.append(retry);
  }
}
restoreLocation();
loadData();
setupPerceptionListeners();

