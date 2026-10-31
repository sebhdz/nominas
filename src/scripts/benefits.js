// Static detail blocks are requested only when a visitor expands the section.
export function setupBenefits({ details, list, status, retry }) {
  const cache = new Map();
  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 20 });
  let person = null;
  let generation = 0;

  async function load() {
    if (!details.open || !person?.prestacionesUrl) return;
    const current = person;
    const requestGeneration = generation;
    status.textContent = 'Cargando prestaciones…';
    retry.hidden = true;
    try {
      if (!cache.has(current.prestacionesUrl)) {
        const request = fetch(current.prestacionesUrl, { signal: AbortSignal.timeout(15000) })
          .then(response => {
            if (!response.ok) throw new Error('Detail unavailable');
            return response.json();
          }).catch(error => {
            cache.delete(current.prestacionesUrl);
            throw error;
          });
        cache.set(current.prestacionesUrl, request);
      }
      const block = await cache.get(current.prestacionesUrl);
      if (generation !== requestGeneration) return;
      const concepts = block[current.id];
      if (!Array.isArray(concepts) || !concepts.length) {
        cache.delete(current.prestacionesUrl);
        throw new Error('Missing record');
      }
      list.replaceChildren();
      for (const concept of concepts) {
        const item = document.createElement('li');
        const info = document.createElement('div');
        info.className = 'benefit-info';
        const title = document.createElement('strong');
        title.textContent = concept.concepto || concept.categoria;
        const period = document.createElement('span');
        period.className = 'benefit-period';
        period.textContent = concept.periodicidad || 'Periodicidad sin dato';
        const context = document.createElement('small');
        context.textContent = concept.categoria;
        info.append(title, period, context);
        const amounts = document.createElement('div');
        amounts.className = 'benefit-amounts';
        for (const [field, label] of [['bruto', 'Bruto'], ['neto', 'Neto']]) {
          if (!Number.isFinite(concept[field])) continue;
          const amount = document.createElement('div');
          const value = document.createElement('strong');
          value.textContent = money.format(concept[field]);
          const caption = document.createElement('small');
          caption.textContent = label;
          amount.append(value, caption);
          amounts.append(amount);
        }
        item.append(info, amounts);
        list.append(item);
      }
      status.textContent = '';
    } catch {
      if (generation !== requestGeneration) return;
      status.textContent = 'No se pudieron cargar las prestaciones.';
      retry.hidden = false;
    }
  }

  details.addEventListener('toggle', load);
  retry.addEventListener('click', load);
  return {
    show(record) {
      generation++;
      person = record;
      details.open = false;
      details.hidden = !record?.prestacionesUrl;
      list.replaceChildren();
      status.textContent = '';
      retry.hidden = true;
    },
  };
}
