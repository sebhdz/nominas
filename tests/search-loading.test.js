import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';

// Solo simula los controles que usa el buscador; no requiere un navegador ni dependencias.
class Control {
  value = '';
  textContent = '';
  children = [];
  attributes = {};
  listeners = {};
  selectedIndex = 0;
  dataset = {};
  classList = { add() {} };
  open = false;
  hidden = false;
  isConnected = true;
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  dispatch(name, event = {}) { return this.listeners[name]({ preventDefault() {}, key: '', ...event }); }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.({}); }
  focus() {}
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100 }; }
  get firstElementChild() { return this.children[0]; }
}

test('conserva búsqueda, filtros y enlace si se editan antes de terminar la descarga', async t => {
  const controls = new Map();
  const control = selector => {
    if (!controls.has(selector)) controls.set(selector, new Control());
    return controls.get(selector);
  };
  const groups = ['all', 'professors', 'others'].map(group => Object.assign(new Control(), { dataset: { group } }));
  const globals = ['document', 'window', 'location', 'history', 'fetch'];
  const previous = globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  t.after(() => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const location = { href: 'http://localhost/nomina/?university=prueba&q=Delia&area=COMUNICACION&orden=menor&persona=1' };
  const requests = [];
  let finishDownload;
  const downloaded = new Promise(resolve => { finishDownload = resolve; });
  Object.assign(globalThis, {
    document: { querySelector: control, querySelectorAll: () => groups, createElement: () => new Control() },
    window: { addEventListener() {} },
    location,
    history: {
      replaceState(_state, _title, url) { location.href = String(url); },
      pushState(_state, _title, url) { location.href = String(url); },
    },
    fetch: async (url) => {
      requests.push(url);
      await downloaded;
      if (url === '/data/universities.json') return { ok: true, json: async () => [
        { id: 'prueba', name: 'Universidad de prueba', period: { inicio: '2026-04-01', fin: '2026-06-30' }, updates: ['2026-07-02'], url: '/data/prueba/2026.json', pensionUrl: '/data/pensions/prueba.json' },
        { id: 'otra', url: '/data/otra/2026.json', pensionUrl: null },
      ] };
      if (url === '/data/pensions/prueba.json') return { ok: true, json: async () => ({
        notes: ['Nota común de la fuente'],
        records: [
          { id: 'p1', nombre: 'ANDRES GURROLA', area: 'COMUNICACION', tipo: 'Años de Servicio', estatus: 'Jubilado(a)', monto: 1500, periodicidad: 'Quincenal' },
          { id: 'p2', nombre: 'DELIA ALMEIDA', area: 'FINANZAS', tipo: 'Viudez', estatus: 'Pensionado(a)', monto: 800, periodicidad: 'Mensual' },
        ],
      }) };
      return { ok: true, json: async () => [
        { id: 1, nombre: 'DELIA ALMEIDA', nombres: 'DELIA', apellidos: 'ALMEIDA', puesto: 'JEFA', area: 'COMUNICACION', bruto: 200, neto: 100 },
        { id: 2, nombre: 'ANDRES GURROLA', nombres: 'ANDRES', apellidos: 'GURROLA', puesto: 'DISEÑADOR', area: 'COMUNICACION', bruto: 300, neto: 200, actualizacion: '2026-07-02' },
      ] };
    },
  });
  await import('../src/scripts/search.js');
  assert.equal(control('#search').value, 'Delia');
  assert.equal(control('#order').value, 'asc');

  control('#search').value = 'Andres';
  control('#search').dispatch('input');
  control('#order').value = 'desc';
  control('#order').dispatch('change');
  groups[2].dispatch('click');
  finishDownload();
  await setImmediate();

  assert.equal(control('#search').value, 'Andres');
  assert.equal(control('#order').value, 'desc');
  assert.equal(control('#area').value, 'COMUNICACION');
  assert.equal(groups[2].attributes['aria-pressed'], 'true');
  assert.equal(control('#results').children.length, 1);
  assert.equal(control('#results').children[0].children[0].children[0].title, 'Andres Gurrola');
  const url = new URL(location.href);
  assert.equal(url.searchParams.get('q'), 'Andres');
  assert.equal(url.searchParams.get('area'), 'COMUNICACION');
  assert.equal(url.searchParams.get('grupo'), 'others');
  assert.equal(url.searchParams.has('persona'), false);
  assert.equal(url.searchParams.has('orden'), false);
  assert.equal(url.searchParams.get('university'), 'prueba');
  assert.deepEqual(requests, ['/data/universities.json', '/data/prueba/2026.json', '/data/pensions/prueba.json']);
  assert.equal(control('#university-name').textContent, 'Nómina Universidad de prueba');
  control('#results').children[0].children[0].children[0].dispatch('click');
  assert.equal(new URL(location.href).searchParams.get('university'), 'prueba');
  assert.equal(new URL(location.href).searchParams.get('persona'), '2');
  assert.match(control('#person-period').textContent, /Universidad de prueba/);
  assert.match(control('#person-source-date').textContent, /2 de julio de 2026/);
  control('#pensions-tab').dispatch('click');
  assert.equal(control('#pensions-panel').hidden, false);
  assert.equal(control('#search').value, 'Andres');
  assert.equal(control('#area').value, 'COMUNICACION');
  assert.equal(new URL(location.href).searchParams.get('tab'), 'pensiones');
  assert.equal(control('#pension-results').children.length, 1);
  assert.equal(control('#pension-results').children[0].children[0].textContent, 'Andres Gurrola');
  assert.match(control('#pension-results').children[0].children[3].children[1].textContent, /Quincenal/);
  assert.equal(control('#pension-note-list').children.length, 1);
  assert.equal(control('#pension-note-list').children[0].textContent, 'Nota común de la fuente');
  assert.equal(control('#pensions-notes').hidden, false);
  assert.equal(control('#pension-results').children[0].children[1].children.length, 2);

  location.href = 'http://localhost/nomina/?university=otra&tab=pensiones';
  requests.length = 0;
  finishDownload();
  await import('../src/scripts/search.js?no-pension-data');
  await setImmediate();
  assert.deepEqual(requests, ['/data/universities.json', '/data/otra/2026.json']);
  assert.equal(control('#pensions-tab').disabled, true);
  assert.equal(control('#pensions-tab').attributes['aria-selected'], 'false');
  assert.equal(control('#pensions-panel').hidden, true);
  assert.equal(new URL(location.href).searchParams.has('tab'), false);

  // An unknown identifier must not silently load another university's payroll.
  location.href = 'http://localhost/nomina/?university=unknown';
  requests.length = 0;
  await import('../src/scripts/search.js?unknown-university');
  await setImmediate();
  assert.deepEqual(requests, ['/data/universities.json']);
  assert.equal(control('#search-section').hidden, true);
  assert.equal(control('.dataset-tabs').hidden, true);
  assert.match(control('#university-error').textContent, /no está disponible/);
  assert.equal(control('#university-error').hidden, false);
});
