// Shared by the early page check and the opinion form.
let scriptPromise;
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => fail(), 15000);
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        scriptPromise = null;
        reject(new Error('Turnstile unavailable'));
      };
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        if (window.turnstile) resolve(window.turnstile);
        else fail();
      };
      script.onerror = fail;
      document.head.append(script);
    });
  }
  return scriptPromise;
}

export function createTurnstile(container, onChange) {
  let api, widgetId, disposed = false;
  const update = (verified, message = '', retryAllowed = false, busy = false) => {
    if (disposed) return;
    onChange(verified, message, retryAllowed, busy);
  };
  return {
    async start() {
      if (!container?.dataset.sitekey) {
        update(false, 'Las opiniones no están habilitadas en este sitio.');
        return;
      }
      update(false, 'Preparando la votación…', false, true);
      try {
        api = await loadScript();
        if (disposed) return;
        update(false, 'Verificando acceso para opinar…', false, true);
        widgetId = api.render(container, {
          sitekey: container.dataset.sitekey,
          action: 'vote',
          appearance: 'interaction-only',
          language: 'es',
          size: container.clientWidth < 300 ? 'compact' : 'flexible',
          callback: () => update(true),
          'before-interactive-callback': () => update(false, 'Completa la verificación para opinar.'),
          'expired-callback': () => this.reset(),
          'timeout-callback': () => this.reset(),
          'error-callback': () => {
            update(false, 'No se pudo verificar. Reintenta la verificación.', true);
            return true;
          },
        });
      } catch {
        update(false, 'No se pudo cargar la verificación. Reintenta o revisa tu conexión.', true);
      }
    },
    reset() {
      update(false, 'Verificando acceso para opinar…', false, true);
      if (disposed) return;
      if (widgetId !== undefined) api.reset(widgetId);
      else return this.start();
    },
    destroy() {
      disposed = true;
      if (widgetId !== undefined) api.remove(widgetId);
    },
  };
}
