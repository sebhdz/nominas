import { findPeople, findPensioners, normalize } from './search-utils.js';
import { loadPerception, resetPerception, setupPerceptionListeners, startBackgroundVerification, fetchBatchOpinions } from './votes.js';
import { getProfessorKey } from '../lib/professor-key.js';

const $ = selector => document.querySelector(selector);
const search = $('#search');
const results = $('#results');
const pensionResults = $('#pension-results');
const status = $('#status');
const dialog = $('#person-dialog');
const area = $('#area');
const areaInput = $('#area-input');
const areaList = $('#area-list');
let areas = [];
let areaOptions = [];
let activeArea = -1;
const order = $('#order');
const pensionType = $('#pension-type');
const pensionStatus = $('#pension-status');
let group = 'all';
let activeTab = 'payroll';
let payrollOrder = 'desc';
let pensionsOrder = 'desc';
const reset = $('#reset');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const PAGE_SIZE = 15;
let people = [];
let pensioners = [];
let pensionAvailable = false;
let pensionLoadError = false;
let matches = [];
let page = 1;
let selected = null;
let ready = false;
let searchTimer;
let lastTrigger = null;
let pendingArea = '';
let pendingPensionType = '';
let pendingPensionStatus = '';
let university;
const formatMoney = value => Number.isFinite(value) ? money.format(value) : 'Sin dato';
const formatPensionAmount = person => {
  if (!Number.isFinite(person.monto)) return 'Sin dato';
  const decimals = person.montoFuente?.split('.')[1]?.length ?? 2;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(person.monto);
};
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
  const values = { q: search.value.trim(), area: area.value || pendingArea };
  if (activeTab === 'payroll') {
    values.grupo = group === 'all' ? '' : group;
    values.orden = order.value === 'asc' ? 'menor' : '';
    values.tipo = '';
    values.estatus = '';
    values.tab = '';
  } else {
    values.grupo = '';
    values.orden = order.value === 'asc' ? 'menor' : '';
    values.tipo = pensionType.value;
    values.estatus = pensionStatus.value;
    values.tab = 'pensiones';
  }
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

function updatePagination() {
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  page = Math.min(page, pages);
  $('#pagination').hidden = pages <= 1;
  $('#page-label').textContent = `Página ${page} de ${pages}`;
  $('#previous-page').disabled = page <= 1;
  $('#next-page').disabled = page >= pages;
}

let tableRenderGeneration = 0;

function createThumbSvg(isDown = false) {
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `row-acceptance-icon${isDown ? ' row-acceptance-icon-down' : ''}`);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M7 10v10H3V10zM7 10l5-7a2 2 0 0 1 2 2l-1 5h6a2 2 0 0 1 2 2l-1 6a2 2 0 0 1-2 2H7');
    svg.append(path);
    return svg;
  }
  const span = element('span', `row-acceptance-icon${isDown ? ' row-acceptance-icon-down' : ''}`);
  span.textContent = isDown ? '👎' : '👍';
  return span;
}

function renderRowAcceptance(container, stats) {
  if (!container || !stats || !stats.total_recommendations) return;

  const total = stats.total_recommendations;
  const yes = stats.recommends_yes || 0;
  const pctYes = Math.round((yes / total) * 100);
  const pctNo = 100 - pctYes;

  container.replaceChildren();

  const track = element('div', 'row-acceptance-track');
  track.setAttribute('title', `${pctYes}% lo recomienda (${total} ${total === 1 ? 'opinión' : 'opiniones'})`);
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuenow', String(pctYes));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-label', `${pctYes}% de recomendación`);

  const segYes = element('div', 'row-acceptance-seg row-acceptance-seg-yes');
  segYes.style.width = `${pctYes}%`;
  const segNo = element('div', 'row-acceptance-seg row-acceptance-seg-no');
  segNo.style.width = `${pctNo}%`;
  track.append(segYes, segNo);

  const label = element('span', 'row-acceptance-pct', `${pctYes}%`);

  container.append(createThumbSvg(false), track, createThumbSvg(true), label);
}

// Both datasets use the same row structure and responsive styles.
function renderTableResults(target, pension = false) {
  tableRenderGeneration += 1;
  const currentRender = tableRenderGeneration;

  target.replaceChildren();
  updatePagination();
  const offset = (page - 1) * PAGE_SIZE;
  const shown = matches.slice(offset, offset + PAGE_SIZE);
  if (!matches.length) {
    const row = element('tr');
    const empty = element('td', 'empty-message');
    empty.colSpan = 4;
    empty.append(element('h3', '', 'No encontramos coincidencias.'), element('p', '', 'Prueba con un apellido o limpia los filtros.'));
    row.append(empty);
    target.append(row);
  }
  const rowContainers = [];
  for (const person of shown) {
    const row = element('tr');
    const nameCell = element('td', 'name-cell');
    const name = element(pension ? 'span' : 'button', pension ? 'person-name' : 'person-link');
    name.append(element('span', 'name-line', readableName(person.nombres)), element('span', 'name-line', readableName(person.apellidos)));
    name.title = readableName(person.nombre);
    if (!pension) {
      name.type = 'button';
      name.setAttribute('aria-label', `Ver sueldo de ${person.nombre}`);
      name.addEventListener('click', () => openPerson(person, name));
    }
    nameCell.append(name);
    if (!pension && university?.id) {
      const profKey = getProfessorKey(university.id, person.nombre);
      const acceptanceEl = element('div', 'row-acceptance');
      acceptanceEl.dataset.profKey = profKey;
      nameCell.append(acceptanceEl);
      rowContainers.push({ key: profKey, el: acceptanceEl });
    }
    const role = element('td', 'role-cell', readableLabel(pension ? person.tipo : person.puesto));
    if (pension) {
      role.append(element('span', 'record-detail', readableLabel(person.estatus)));
      if (person.periodo) role.append(element('span', 'record-detail', `Periodo informado: ${formatPeriod(person.periodo)}`));
    }
    const areaCell = element('td', 'area-cell', readableLabel(person.area));
    const salary = element('td', 'salary-cell');
    salary.append(
      element('span', 'gross-value', pension ? formatPensionAmount(person) : formatMoney(person.bruto)),
      element('span', 'salary-label-small', pension ? readableLabel(person.periodicidad || 'Periodicidad sin dato') : 'Bruto mensual'),
    );
    if (!pension) salary.append(element('span', 'net-value', `${formatMoney(person.neto)} neto`));
    row.append(nameCell, role, areaCell, salary);
    target.append(row);
  }
  status.textContent = `Mostrando ${shown.length ? offset + 1 : 0}–${offset + shown.length} de ${matches.length.toLocaleString('es-MX')} registros`;
  target.setAttribute('aria-busy', 'false');

  if (rowContainers.length > 0) {
    const keys = rowContainers.map(r => r.key);
    fetchBatchOpinions(keys).then(results => {
      if (currentRender !== tableRenderGeneration) return;
      if (!results || typeof results !== 'object') return;
      for (const { key, el } of rowContainers) {
        if (key && results[key]) {
          renderRowAcceptance(el, results[key]);
        }
      }
    }).catch(() => {});
  }
}

function renderResults() {
  renderTableResults(results);
}

function renderPensionResults() {
  if (!pensionAvailable) {
    pensionResults.replaceChildren();
    $('#pensions-unavailable').hidden = false;
    $('#pensions-unavailable').textContent = pensionLoadError
      ? 'No pudimos cargar los datos de pensiones. Intenta volver a cargar la página.'
      : 'No hay datos de pensiones disponibles para esta universidad.';
    $('#pensions-table-wrap').hidden = true;
    status.textContent = $('#pensions-unavailable').textContent;
    $('#pagination').hidden = true;
    pensionResults.setAttribute('aria-busy', 'false');
    return;
  }
  $('#pensions-unavailable').hidden = true;
  $('#pensions-table-wrap').hidden = false;
  renderTableResults(pensionResults, true);
}

function updateAreaOptions(records) {
  const selectedArea = area.value || pendingArea;
  areas = [...new Set(records.map(person => person.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  if (selectedArea && !areas.includes(selectedArea)) areas.push(selectedArea);
  areaInput.disabled = false;
  setArea(selectedArea);
  pendingArea = area.value;
}

function updatePensionOptions(records) {
  for (const [control, key, label, pending] of [[pensionType, 'tipo', 'Todos los tipos', pendingPensionType], [pensionStatus, 'estatus', 'Todos los estatus', pendingPensionStatus]]) {
    const selected = control.value || pending;
    const values = [...new Set(records.map(person => person[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    control.replaceChildren(element('option', '', label));
    control.firstElementChild.value = '';
    for (const value of values) {
      const option = element('option', '', readableLabel(value));
      option.value = value;
      control.append(option);
    }
    if (selected && !values.includes(selected)) {
      const option = element('option', '', readableLabel(selected));
      option.value = selected;
      control.append(option);
    }
    control.value = selected;
    if (control.selectedIndex < 0) control.value = '';
  }
  pendingPensionType = pensionType.value;
  pendingPensionStatus = pensionStatus.value;
}

function activateTab(tab, updateURL = true) {
  const nextTab = tab === 'pensions' && pensionAvailable ? 'pensions' : 'payroll';
  if (activeTab !== nextTab) {
    if (activeTab === 'payroll') payrollOrder = order.value;
    else pensionsOrder = order.value;
  }
  if (activeTab === 'payroll' && nextTab === 'pensions' && dialog.open) dialog.close();
  activeTab = nextTab;
  order.value = activeTab === 'payroll' ? payrollOrder : pensionsOrder;
  const payroll = activeTab === 'payroll';
  $('#payroll-tab').setAttribute('aria-selected', String(payroll));
  $('#payroll-tab').tabIndex = payroll ? 0 : -1;
  $('#pensions-tab').setAttribute('aria-selected', String(!payroll));
  $('#pensions-tab').tabIndex = payroll ? -1 : 0;
  $('#pensions-tab').disabled = !pensionAvailable;
  $('#pensions-tab').hidden = !pensionAvailable;
  $('#payroll-panel').hidden = !payroll;
  $('#pensions-panel').hidden = payroll;
  $('#payroll-filters').hidden = !payroll;
  $('#pension-filters').hidden = payroll || !pensionAvailable;
  $('#search-label').textContent = payroll ? 'Busca a tu profe' : 'Busca a una persona pensionada';
  search.placeholder = payroll ? 'Nombre, puesto o departamento' : 'Nombre, tipo de pensión o área';
  $('#search-submit').textContent = payroll ? 'Ver sueldo' : 'Buscar';
  $('#order-label').textContent = payroll ? 'Ordenar por sueldo bruto' : 'Ordenar por monto reportado';
  $('#order').setAttribute('aria-label', payroll ? 'Ordenar por sueldo bruto' : 'Ordenar por monto reportado');
  if (ready) {
    const records = payroll ? people : pensioners;
    updateAreaOptions(records);
    if (!payroll) updatePensionOptions(pensioners);
  }
  if (updateURL) {
    const url = queryURL();
    url.searchParams.delete('persona');
    history.replaceState(null, '', url);
  }
  if (ready) runSearch({ updateURL: false });
  else if (!payroll) renderPensionResults();
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
  if (activeTab === 'pensions') {
    matches = pensionAvailable ? findPensioners(pensioners, search.value, {
      area: area.value,
      type: pensionType.value,
      status: pensionStatus.value,
      order: order.value,
    }) : [];
    $('#pension-sort-note').textContent = `Ordenado por monto reportado, de ${order.value === 'asc' ? 'menor a mayor' : 'mayor a menor'} · MXN; se conserva la periodicidad de la fuente`;
    reset.hidden = !search.value && !area.value && !pensionType.value && !pensionStatus.value && order.value === 'desc';
    renderPensionResults();
  } else {
    matches = findPeople(people, search.value, { area: area.value, group, order: order.value });
    $('#payroll-sort-note').textContent = `Ordenado por sueldo bruto, de ${order.value === 'asc' ? 'menor a mayor' : 'mayor a menor'} · MXN`;
    reset.hidden = !search.value && !area.value && group === 'all' && order.value === 'desc';
    renderResults();
  }
}

function openPerson(person, trigger = search, updateURL = true) {
  selected = person;
  lastTrigger = trigger;
  $('#person-name').textContent = readableName(person.nombre);
  $('#person-role').textContent = readableLabel(person.puesto);
  $('#person-area').textContent = readableLabel(person.area);
  $('#person-gross').textContent = formatMoney(person.bruto);
  $('#person-net').textContent = formatMoney(person.neto);
  $('#person-period').textContent = `Periodo informado: ${formatPeriod(university.period)}`;
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
  area.value = pendingArea = value;
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
order.addEventListener('change', () => {
  if (activeTab === 'payroll') payrollOrder = order.value;
  else pensionsOrder = order.value;
  runSearch();
});
pensionType.addEventListener('change', () => runSearch());
pensionStatus.addEventListener('change', () => runSearch());
function setGroup(value) {
  group = value;
  document.querySelectorAll('[data-group]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.group === group)));
}
for (const button of document.querySelectorAll('[data-group]')) {
  button.addEventListener('click', () => { setGroup(button.dataset.group); runSearch(); });
}
$('#payroll-tab').addEventListener('click', () => activateTab('payroll'));
$('#pensions-tab').addEventListener('click', () => activateTab('pensions'));
for (const [tab, panel] of [['#payroll-tab', 'payroll'], ['#pensions-tab', 'pensions']]) {
  $(tab).addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = panel === 'payroll' ? 'pensions' : 'payroll';
      if (next === 'pensions' && !pensionAvailable) return;
      activateTab(next);
      $(`#${next}-tab`).focus();
    }
  });
}
reset.addEventListener('click', () => {
  search.value = area.value = areaInput.value = '';
  pendingArea = '';
  order.value = 'desc';
  pensionType.value = pensionStatus.value = '';
  setGroup('all');
  runSearch();
  search.focus();
});
for (const [selector, change] of [['#previous-page', -1], ['#next-page', 1]]) {
  $(selector).addEventListener('click', () => {
    page += change;
    if (activeTab === 'pensions') renderPensionResults();
    else renderResults();
    document.querySelector(`#${activeTab === 'pensions' ? 'pension-results' : 'results'} button`)?.focus({ preventScroll: true });
    document.querySelector(activeTab === 'pensions' ? '#pensions-panel' : '#payroll-panel').scrollIntoView({ block: 'start' });
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
  area.value = pendingArea;
  if (ready) setArea(pendingArea);
  const requestedGroup = url.searchParams.get('grupo');
  const requestedOrder = url.searchParams.get('orden') === 'menor' ? 'asc' : 'desc';
  if (url.searchParams.get('tab') === 'pensiones') pensionsOrder = requestedOrder;
  else payrollOrder = requestedOrder;
  pendingPensionType = url.searchParams.get('tipo') || '';
  pendingPensionStatus = url.searchParams.get('estatus') || '';
  pensionType.value = pendingPensionType;
  pensionStatus.value = pendingPensionStatus;
  setGroup(['professors', 'others'].includes(requestedGroup) ? requestedGroup : 'all');
  const requestedTab = url.searchParams.get('tab') === 'pensiones' ? 'pensions' : 'payroll';
  activeTab = 'payroll';
  activateTab(requestedTab, false);
  if (requestedTab === 'pensions' && !pensionAvailable) {
    url.searchParams.delete('tab');
    history.replaceState(null, '', url);
  }
  runSearch({ updateURL: false });
  if (ready) restorePerson();
}

function restorePerson() {
  const url = new URL(location.href);
  const id = activeTab === 'payroll' ? url.searchParams.get('persona') : null;
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
      $('#search-section').hidden = true;
      $('#payroll-panel').hidden = true;
      $('#pensions-panel').hidden = true;
      $('.dataset-tabs').hidden = true;
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
    if (university.pensionUrl) {
      try {
        const pensionResponse = await fetch(university.pensionUrl);
        if (!pensionResponse.ok) throw new Error(`HTTP ${pensionResponse.status}`);
        const pensionData = await pensionResponse.json();
        pensioners = pensionData.records;
        const validPensions = Array.isArray(pensioners);
        pensionAvailable = validPensions && pensioners.length > 0;
        if (!validPensions) pensionLoadError = true;
      } catch {
        pensionLoadError = true;
      }
    }
    ready = true;
    const requestedTab = new URL(location.href).searchParams.get('tab') === 'pensiones' ? 'pensions' : 'payroll';
    activateTab(requestedTab, false);
    if (requestedTab === 'pensions' && !pensionAvailable) {
      const url = new URL(location.href);
      url.searchParams.delete('tab');
      history.replaceState(null, '', url);
    }
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
startBackgroundVerification();
