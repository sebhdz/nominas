// Keep the published scale intact; the /10 value is a display equivalence.
export function evaluationSummary(person) {
  const score = person.evaluacion;
  const maximum = person.evaluacionMaximo;
  if (!Number.isFinite(score) || !Number.isFinite(maximum) || maximum <= 0) return null;
  const format = value => value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const count = person.evaluacionRegistros;
  const context = Number.isInteger(count) && count > 1
    ? `Promedio de ${count} resultados institucionales`
    : 'Resultado institucional';
  return {
    equivalent: `${format(score / maximum * 10)} / 10`,
    original: `${format(score)} / ${maximum}`,
    context: [context, person.evaluacionPeriodo].filter(Boolean).join(' · '),
  };
}
