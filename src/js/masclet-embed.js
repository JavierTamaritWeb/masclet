(function () {
  const STYLE_ID = 'masclet-embed-styles';
  const ROOT_CLASS = 'masclet-embed';
  const OPEN_CLASS = 'masclet-embed--open';
  const DEFAULTS = {
    iframePath: 'chatbot.html',
    language: 'es',
    kbUrl: '',
    openByDefault: false,
    bottom: 20,
    right: 20,
    width: 420,
    height: 720,
    zIndex: 2147483000,
    title: 'Masclet',
    openLabel: 'Abrir Masclet',
    closeLabel: 'Cerrar Masclet',
  };

  function normalizeBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return fallback;

    return ['1', 'true', 'yes', 'on', 'si'].includes(value.trim().toLowerCase());
  }

  function parseNumber(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function resolveScriptElement() {
    return document.currentScript || document.querySelector('script[data-masclet-auto-init]');
  }

  function readDatasetOptions(script) {
    const dataset = script?.dataset || {};

    return {
      iframePath: dataset.mascletIframePath,
      language: dataset.mascletLanguage,
      kbUrl: dataset.mascletKbUrl,
      openByDefault: normalizeBoolean(dataset.mascletOpenByDefault, DEFAULTS.openByDefault),
      bottom: parseNumber(dataset.mascletBottom, DEFAULTS.bottom),
      right: parseNumber(dataset.mascletRight, DEFAULTS.right),
      width: parseNumber(dataset.mascletWidth, DEFAULTS.width),
      height: parseNumber(dataset.mascletHeight, DEFAULTS.height),
      zIndex: parseNumber(dataset.mascletZIndex, DEFAULTS.zIndex),
      title: dataset.mascletTitle,
      openLabel: dataset.mascletOpenLabel,
      closeLabel: dataset.mascletCloseLabel,
      autoInit: normalizeBoolean(dataset.mascletAutoInit, true),
    };
  }

  function getAssetBaseUrl(script, overridePath) {
    if (overridePath) {
      return new URL(overridePath, window.location.href);
    }

    if (script?.src) {
      return new URL('../', script.src);
    }

    return new URL('./', window.location.href);
  }

  function buildIframeUrl(baseUrl, options) {
    const iframeUrl = new URL(options.iframePath || DEFAULTS.iframePath, baseUrl);

    if (options.language) {
      iframeUrl.searchParams.set('lang', options.language);
    }

    if (options.kbUrl) {
      iframeUrl.searchParams.set('kbUrl', options.kbUrl);
    }

    return iframeUrl.toString();
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${ROOT_CLASS} {
        position: fixed;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 12px;
        pointer-events: none;
      }

      .${ROOT_CLASS}__toggle {
        pointer-events: auto;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, #ff6a00 0%, #ff2d55 100%);
        color: #fff;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 14px 18px;
        font: 600 15px/1.1 Inter, system-ui, sans-serif;
        box-shadow: 0 20px 40px rgba(15, 23, 42, 0.28);
        transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
      }

      .${ROOT_CLASS}__toggle:hover {
        transform: translateY(-1px);
        box-shadow: 0 24px 48px rgba(15, 23, 42, 0.34);
      }

      .${ROOT_CLASS}__toggle:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 3px;
      }

      .${ROOT_CLASS}__toggle-icon {
        width: 18px;
        height: 18px;
        display: inline-flex;
      }

      .${ROOT_CLASS}__frame {
        width: min(var(--masclet-width, 420px), calc(100vw - 16px));
        height: min(var(--masclet-height, 720px), calc(100vh - 16px));
        max-height: calc(100vh - 16px);
        border: 0;
        border-radius: 24px;
        background: transparent;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.32);
        opacity: 0;
        pointer-events: none;
        transform: translateY(12px) scale(0.98);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .${ROOT_CLASS}.${OPEN_CLASS} .${ROOT_CLASS}__frame {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0) scale(1);
      }

      @media (max-width: 768px) {
        .${ROOT_CLASS} {
          left: 8px !important;
          right: 8px !important;
          bottom: 8px !important;
          align-items: stretch;
        }

        .${ROOT_CLASS}__frame {
          width: 100%;
          height: min(var(--masclet-height, 720px), calc(100vh - 16px));
          border-radius: 20px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function getToggleMarkup(isOpen, options) {
    const label = isOpen ? options.closeLabel : options.title;
    const icon = isOpen
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

    return `<span class="${ROOT_CLASS}__toggle-icon">${icon}</span><span>${label}</span>`;
  }

  function updateToggleButton(button, isOpen, options) {
    button.innerHTML = getToggleMarkup(isOpen, options);
    button.setAttribute('aria-expanded', String(isOpen));
    button.setAttribute('aria-label', isOpen ? options.closeLabel : options.openLabel);
  }

  function createInstance(options = {}) {
    const script = options.script || resolveScriptElement();
    const mergedOptions = {
      ...DEFAULTS,
      ...readDatasetOptions(script),
      ...options,
    };
    const baseUrl = getAssetBaseUrl(script, mergedOptions.basePath);
    const root = document.createElement('div');
    const button = document.createElement('button');
    const iframe = document.createElement('iframe');
    let isOpen = false;

    ensureStyles();

    root.className = ROOT_CLASS;
    root.style.bottom = `${mergedOptions.bottom}px`;
    root.style.right = `${mergedOptions.right}px`;
    root.style.zIndex = String(mergedOptions.zIndex);
    root.style.setProperty('--masclet-width', `${mergedOptions.width}px`);
    root.style.setProperty('--masclet-height', `${mergedOptions.height}px`);

    button.type = 'button';
    button.className = `${ROOT_CLASS}__toggle`;

    iframe.className = `${ROOT_CLASS}__frame`;
    iframe.loading = 'lazy';
    iframe.title = mergedOptions.title;
    iframe.src = buildIframeUrl(baseUrl, mergedOptions);

    root.appendChild(iframe);
    root.appendChild(button);

    const open = () => {
      isOpen = true;
      root.classList.add(OPEN_CLASS);
      updateToggleButton(button, isOpen, mergedOptions);
    };

    const close = () => {
      isOpen = false;
      root.classList.remove(OPEN_CLASS);
      updateToggleButton(button, isOpen, mergedOptions);
    };

    const toggle = () => {
      if (isOpen) {
        close();
        return;
      }

      open();
    };

    button.addEventListener('click', toggle);
    updateToggleButton(button, isOpen, mergedOptions);

    const mountTarget = mergedOptions.mount && typeof mergedOptions.mount === 'string'
      ? document.querySelector(mergedOptions.mount)
      : document.body;

    mountTarget.appendChild(root);

    if (mergedOptions.openByDefault) {
      open();
    }

    return {
      root,
      iframe,
      button,
      open,
      close,
      toggle,
      destroy() {
        root.remove();
      },
    };
  }

  function init(options = {}) {
    if (!document.body) {
      throw new Error('MascletEmbed.init requiere document.body disponible');
    }

    const existingRoot = document.querySelector(`.${ROOT_CLASS}`);
    if (existingRoot) {
      return {
        root: existingRoot,
        iframe: existingRoot.querySelector(`.${ROOT_CLASS}__frame`),
        button: existingRoot.querySelector(`.${ROOT_CLASS}__toggle`),
      };
    }

    return createInstance(options);
  }

  window.MascletEmbed = {
    init,
  };

  const script = resolveScriptElement();
  const autoInitOptions = readDatasetOptions(script);

  if (autoInitOptions.autoInit !== false) {
    const boot = () => init({ script });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }
})();