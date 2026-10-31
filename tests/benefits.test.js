import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBenefits } from '../src/scripts/benefits.js';

class Element {
  open = false;
  hidden = false;
  textContent = '';
  children = [];
  listeners = {};
  addEventListener(event, callback) { this.listeners[event] = callback; }
  append(...items) { this.children.push(...items); }
  replaceChildren() { this.children = []; }
}

function environment(t) {
  const originals = ['document', 'fetch'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  t.after(() => { for (const [key, value] of originals) {
    if (value) Object.defineProperty(globalThis, key, value);
    else delete globalThis[key];
  } });
  globalThis.document = { createElement: () => new Element() };
  const elements = Object.fromEntries(['details', 'list', 'status', 'retry'].map(k => [k, new Element()]));
  const view = setupBenefits(elements);
  const open = () => { elements.details.open = true; return elements.details.listeners.toggle(); };
  return { ...elements, view, open };
}
const person = id => ({ id, prestacionesUrl: '/static/block.json' });
const concept = { concepto: '<script>source text</script>', categoria: 'Primas', bruto: 123.4567, neto: null, periodicidad: 'ANUAL' };

test('benefits load only on expansion, reuse blocks and leave source text as text', async t => {
  const env = environment(t);
  let requests = 0;
  globalThis.fetch = async () => { requests++; return { ok: true, json: async () => ({ a: [concept], b: [concept] }) }; };
  env.view.show(person('a'));
  assert.equal(requests, 0);
  await env.open();
  assert.equal(requests, 1);
  assert.equal(env.list.children[0].children[0].children[0].textContent, concept.concepto);
  assert.match(env.list.children[0].children[1].children[0].children[0].textContent, /123\.4567/);
  env.view.show(person('b'));
  await env.open();
  assert.equal(requests, 1);
  env.view.show({ id: 'no-benefits' });
  assert.equal(env.details.hidden, true);
  assert.equal(env.list.children.length, 0);
});

test('failed downloads can be retried and stale replies do not populate another profile', async t => {
  const env = environment(t);
  let finish;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  env.view.show(person('a'));
  const pending = env.open();
  env.view.show(null);
  finish({ ok: true, json: async () => ({ a: [concept] }) });
  await pending;
  assert.equal(env.list.children.length, 0);
  env.view.show({ id: 'b', prestacionesUrl: '/static/other.json' });
  globalThis.fetch = async () => ({ ok: false });
  await env.open();
  assert.equal(env.retry.hidden, false);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ b: [concept] }) });
  await env.retry.listeners.click();
  assert.equal(env.retry.hidden, true);
  assert.equal(env.list.children.length, 1);
});
