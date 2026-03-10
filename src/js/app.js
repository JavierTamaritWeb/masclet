// ============================================================
// APP.JS – Masclet Bot Fallero
// Chatbot interactivo con NLP, Fuse.js y Compromise
// ============================================================

// ---- Análisis semántico con Compromise ----
function analizarConsultaCompromise(q) {
  if (typeof nlp !== 'function') return q;
  const doc = nlp(q);
  const nouns = doc.nouns().out('array');
  const verbs = doc.verbs().out('array');
  const topics = [...nouns, ...verbs].join(' ');
  console.log('🔎 Análisis semántico:', topics);
  return topics || q;
}

// ---- Convertir URLs de YouTube a embed ----
function convertYoutube(url) {
  const regExp = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/;
  const match = url.match(regExp);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

// ---- Elementos del DOM (BEM) ----
const hasDocument = typeof document !== 'undefined';
const chatEl = hasDocument ? document.querySelector('.chatbot') : null;
const headerEl = hasDocument ? document.querySelector('.chatbot__header') : null;
const pageHeaderTitleEl = hasDocument ? document.querySelector('.page-header__title') : null;
const pageHeaderSubtitleEl = hasDocument ? document.querySelector('.page-header__subtitle') : null;
const titleEl = hasDocument ? document.querySelector('.chatbot__title') : null;
const toggleBtn = hasDocument ? document.querySelector('.chatbot__toggle') : null;
const languageLabelEl = hasDocument ? document.querySelector('label[for="chat-language"]') : null;
const languageSelectEl = hasDocument ? document.querySelector('.chatbot__language-select') : null;
const messagesEl = hasDocument ? document.querySelector('.chatbot__body') : null;
const suggestionsEl = hasDocument ? document.querySelector('.suggestions') : null;
const inputLabelEl = hasDocument ? document.querySelector('label[for="chat-input"]') : null;
const inputEl = hasDocument ? document.querySelector('.input-area__field') : null;
const sendBtn = hasDocument ? document.querySelector('.input-area__send') : null;
const resetBtn = hasDocument ? document.querySelector('.input-area__reset') : null;
const descriptionMetaEl = hasDocument ? document.querySelector('meta[name="description"]') : null;
const wrapper = hasDocument ? document.querySelector('.chat-wrapper') : null;

function getRuntimeSearchParams() {
  if (!hasDocument || typeof window === 'undefined') return null;

  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return null;
  }
}

function readRuntimeQueryParam(name) {
  const params = getRuntimeSearchParams();
  return params?.get(name) ?? null;
}

function getKnowledgeBaseUrl() {
  return readRuntimeQueryParam('kbUrl') || 'data/knowledge.json';
}

function isStaticChatMode() {
  return chatEl?.classList.contains('chatbot--static');
}

// ---- Stop words (palabras comunes a filtrar) ----
const stopWordsList = [
  'el', 'la', 'los', 'las', 'de', 'del', 'y', 'a', 'en',
  'con', 'para', 'por', 'al', 'ante', 'bajo', 'cabe', 'desde',
  'durante', 'excepto', 'mediante', 'según', 'sin', 'tras',
];

function createStopWordsRegex(list) {
  const pattern = '\\b(' + list.join('|') + ')\\b';
  return new RegExp(pattern, 'gi');
}

const stopWords = createStopWordsRegex(stopWordsList);

// ---- Utilidades de texto ----
function removeDiacritics(str) {
  if (typeof str !== 'string') return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanText(text) {
  if (!text) return '';
  // Si es un array (como saludos variados), lo unimos para normalizarlo todo
  const str = Array.isArray(text) ? text.join(' ') : String(text);
  let cleaned = removeDiacritics(str).toLowerCase();
  cleaned = cleaned.replace(stopWords, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

// ---- Drag & Drop para mover el chat ----
let dragging = false;
let dx = 0;
let dy = 0;

if (hasDocument) {
  headerEl?.addEventListener('mousedown', (e) => {
    if (isStaticChatMode()) return;

    const interactiveTarget = typeof e.target?.closest === 'function'
      ? e.target.closest('.chatbot__toggle, .chatbot__language')
      : null;
    if (interactiveTarget) return;
    dragging = true;
    chatEl.style.right = 'auto';
    chatEl.style.bottom = 'auto';
    const r = chatEl.getBoundingClientRect();
    dx = e.clientX - r.left;
    dy = e.clientY - r.top;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging || isStaticChatMode()) return;
    let newLeft = e.clientX - dx;
    let newTop = e.clientY - dy;
    const chatWidth = chatEl.offsetWidth;
    const chatHeight = chatEl.offsetHeight;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (newLeft < 0) newLeft = 0;
    if (newLeft + chatWidth > windowWidth) newLeft = windowWidth - chatWidth;
    if (newTop < 0) newTop = 0;
    if (newTop + chatHeight > windowHeight) newTop = windowHeight - chatHeight;

    chatEl.style.left = newLeft + 'px';
    chatEl.style.top = newTop + 'px';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.userSelect = '';
  });

  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isMin = chatEl.classList.toggle('chatbot--minimized');
    toggleBtn.innerHTML = `<i data-lucide="${isMin ? 'message-circle' : 'chevron-down'}"></i>`;
    if (window.lucide) window.lucide.createIcons();
    toggleBtn.setAttribute('aria-expanded', String(!isMin));
    updateToggleButtonLabel(isMin);
  });

  window.addEventListener('resize', checkScreenSize);
}

// ---- Variables globales para respuestas ----
let respuestas = [];
let fuse;
let respuestasPlanas = [];
let defaultFollowUps = [];
let knowledgeBaseData = null;
let currentLanguage = 'es';

// ---- Configuración de búsqueda difusa ----
const DEFAULT_LANGUAGE = 'es';
const DATE_LOCALE = 'es-ES';
const LANGUAGE_STORAGE_KEY = 'masclet:language';
const REGEX_TRIGGER_PREFIX = 'regex:';
const FUSE_DIRECT_RESPONSE_SCORE = 0.6;
const FUSE_GUIDANCE_SCORE = 0.78;
const FUSE_GUIDANCE_RESULT_LIMIT = 3;
const FUSE_LIMIT = 8;
const FALLBACK_SUGGESTION_LIMIT = 4;
const STATIC_FALLBACK_SUGGESTIONS = [
  'Plantà',
  'Cremà',
  'Traje de fallera',
  'Buñuelos',
];
const FUSE_DEBUG_QUERY_PARAM = 'debugFuse';
const FUSE_DIRECT_QUERY_PARAM = 'fuseDirect';
const FUSE_GUIDANCE_QUERY_PARAM = 'fuseGuidance';
const FUSE_DEBUG_STORAGE_KEY = 'masclet:fuse-debug';
const FUSE_DIRECT_STORAGE_KEY = 'masclet:fuse-direct';
const FUSE_GUIDANCE_STORAGE_KEY = 'masclet:fuse-guidance';
const FUSE_LOG_STORAGE_KEY = 'masclet:fuse-log';
const FUSE_LOG_LIMIT = 60;
const LANGUAGE_CONFIGS = {
  es: {
    label: 'ES',
    dateLocale: 'es-ES',
    dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    staticFallbackSuggestions: ['Plantà', 'Cremà', 'Traje de fallera', 'Buñuelos'],
    page: {
      documentLanguage: 'es',
      documentTitle: 'Masclet Bot Fallero',
      documentDescription: 'Masclet Bot Fallero: tu chatbot interactivo sobre las Fallas de Valencia. Pregunta sobre cultura, gastronomía, vestimenta y tradiciones falleras.',
      headerTitle: '🎆 Masclet Bot Fallero',
      headerSubtitle: '¡Hola! Soy Masclet, el bot fallero. Pregúntame lo que quieras.',
    },
    ui: {
      title: 'Masclet Bot',
      languageLabel: 'Idioma del chat',
      chatAriaLabel: 'Chat con Masclet Bot',
      messagesAriaLabel: 'Mensajes del chat',
      suggestionsAriaLabel: 'Sugerencias',
      inputLabel: 'Escribe tu pregunta',
      inputPlaceholder: 'Escribe tu pregunta...',
      sendButtonLabel: 'Enviar mensaje',
      resetButtonLabel: 'Reiniciar conversación',
      resetButtonTitle: 'Reiniciar conversación',
      openChatLabel: 'Abrir chat',
      minimizeChatLabel: 'Minimizar chat',
      welcomeMessage: '¡BOOM! 🎇 Soy Masclet. Salúdame con "hola".',
      resetMessage: '¡Aquí estoy de nuevo! ¿Qué necesitas?',
      loadErrorText: '¡Uy! No he podido cargar mis respuestas.',
      unexpectedErrorText: '¡Ups! Algo falló.',
      guidedFallbackText: 'No tengo una coincidencia exacta, pero estas sugerencias están cerca de lo que buscas.',
      globalFallbackText: 'No encontré una coincidencia clara, pero puedo orientarte con estas sugerencias.',
      contextualGreetings: {
        morning: '¡Buenos días!',
        afternoon: '¡Buenas tardes!',
        evening: '¡Buenas noches!',
      },
      greetingMatcher: /hola|salud/i,
    },
  },
  va: {
    label: 'VA',
    dateLocale: 'ca-ES',
    dayNames: ['Diumenge', 'Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte'],
    staticFallbackSuggestions: ['Plantà', 'Cremà', 'Vestit de fallera', 'Bunyols'],
    page: {
      documentLanguage: 'ca',
      documentTitle: 'Masclet Bot Faller',
      documentDescription: 'Masclet Bot Faller: el teu xatbot interactiu sobre les Falles de València. Pregunta sobre cultura, gastronomia, indumentària i tradicions falleres.',
      headerTitle: '🎆 Masclet Bot Faller',
      headerSubtitle: "Hola! Sóc Masclet, el bot faller. Pregunta'm el que vulgues.",
    },
    ui: {
      title: 'Masclet Bot',
      languageLabel: 'Idioma del xat',
      chatAriaLabel: 'Xat amb Masclet Bot',
      messagesAriaLabel: 'Missatges del xat',
      suggestionsAriaLabel: 'Suggeriments',
      inputLabel: 'Escriu la teua pregunta',
      inputPlaceholder: 'Escriu la teua pregunta...',
      sendButtonLabel: 'Enviar missatge',
      resetButtonLabel: 'Reiniciar conversa',
      resetButtonTitle: 'Reiniciar conversa',
      openChatLabel: 'Obrir xat',
      minimizeChatLabel: 'Minimitzar xat',
      welcomeMessage: '¡BOOM! 🎇 Sóc Masclet. Saluda\'m amb "hola" o "ei".',
      resetMessage: 'Ja estic ací de nou! Què necessites?',
      loadErrorText: 'Ai! No he pogut carregar les meues respostes.',
      unexpectedErrorText: 'Ai! Alguna cosa ha fallat.',
      guidedFallbackText: 'No tinc una coincidència exacta, però estos suggeriments s\'acosten al que busques.',
      globalFallbackText: 'No he trobat una coincidència clara, però puc orientar-te amb estos suggeriments.',
      contextualGreetings: {
        morning: 'Bon dia!',
        afternoon: 'Bona vesprada!',
        evening: 'Bona nit!',
      },
      greetingMatcher: /hola|salutacions/i,
    },
  },
  en: {
    label: 'EN',
    dateLocale: 'en-GB',
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    staticFallbackSuggestions: ['Plantà', 'Cremà', 'Fallera dress', 'Fritters'],
    page: {
      documentLanguage: 'en',
      documentTitle: 'Masclet Fallas Bot',
      documentDescription: 'Masclet Fallas Bot: your interactive chatbot about the Fallas festival in Valencia. Ask about culture, food, clothing and Fallas traditions.',
      headerTitle: '🎆 Masclet Fallas Bot',
      headerSubtitle: 'Hi! I am Masclet, your Fallas bot. Ask me anything you want.',
    },
    ui: {
      title: 'Masclet Bot',
      languageLabel: 'Chat language',
      chatAriaLabel: 'Chat with Masclet Bot',
      messagesAriaLabel: 'Chat messages',
      suggestionsAriaLabel: 'Suggestions',
      inputLabel: 'Type your question',
      inputPlaceholder: 'Type your question...',
      sendButtonLabel: 'Send message',
      resetButtonLabel: 'Reset conversation',
      resetButtonTitle: 'Reset conversation',
      openChatLabel: 'Open chat',
      minimizeChatLabel: 'Minimize chat',
      welcomeMessage: 'BOOM! 🎇 I\'m Masclet. Say hi with "hello".',
      resetMessage: 'I\'m back again! What do you need?',
      loadErrorText: 'Oops! I couldn\'t load my answers.',
      unexpectedErrorText: 'Oops! Something went wrong.',
      guidedFallbackText: 'I don\'t have an exact match, but these suggestions are close to what you need.',
      globalFallbackText: 'I couldn\'t find a clear match, but I can guide you with these suggestions.',
      contextualGreetings: {
        morning: 'Good morning!',
        afternoon: 'Good afternoon!',
        evening: 'Good evening!',
      },
      greetingMatcher: /hello|greetings/i,
    },
  },
  fr: {
    label: 'FR',
    dateLocale: 'fr-FR',
    dayNames: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    staticFallbackSuggestions: ['Plantà', 'Cremà', 'Robe fallera', 'Beignets'],
    page: {
      documentLanguage: 'fr',
      documentTitle: 'Masclet Bot des Fallas',
      documentDescription: 'Masclet Bot des Fallas : votre chatbot interactif sur les Fallas de Valence. Posez des questions sur la culture, la gastronomie, les tenues et les traditions falleras.',
      headerTitle: '🎆 Masclet Bot des Fallas',
      headerSubtitle: 'Bonjour ! Je suis Masclet, le bot des Fallas. Posez-moi la question que vous voulez.',
    },
    ui: {
      title: 'Masclet Bot',
      languageLabel: 'Langue du chat',
      chatAriaLabel: 'Chat avec Masclet Bot',
      messagesAriaLabel: 'Messages du chat',
      suggestionsAriaLabel: 'Suggestions',
      inputLabel: 'Écrivez votre question',
      inputPlaceholder: 'Écrivez votre question...',
      sendButtonLabel: 'Envoyer le message',
      resetButtonLabel: 'Réinitialiser la conversation',
      resetButtonTitle: 'Réinitialiser la conversation',
      openChatLabel: 'Ouvrir le chat',
      minimizeChatLabel: 'Réduire le chat',
      welcomeMessage: 'BOOM! 🎇 Je suis Masclet. Saluez-moi avec "bonjour".',
      resetMessage: 'Me revoilà ! De quoi avez-vous besoin ?',
      loadErrorText: 'Oups ! Je n\'ai pas pu charger mes réponses.',
      unexpectedErrorText: 'Oups ! Quelque chose a échoué.',
      guidedFallbackText: 'Je n\'ai pas de correspondance exacte, mais ces suggestions sont proches de ce que vous cherchez.',
      globalFallbackText: 'Je n\'ai pas trouvé de correspondance claire, mais je peux vous guider avec ces suggestions.',
      contextualGreetings: {
        morning: 'Bonjour !',
        afternoon: 'Bon après-midi !',
        evening: 'Bonsoir !',
      },
      greetingMatcher: /bonjour|salut|coucou/i,
    },
  },
};
const FUSE_OPTIONS = {
  keys: [
    { name: 'combo', weight: 0.45 },
    { name: 'keywordsStr', weight: 0.25 },
    { name: 'normalized', weight: 0.15 },
    { name: 'followUpStr', weight: 0.1 },
    { name: 'triggerStr', weight: 0.05 },
  ],
  threshold: 0.42,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

const FuseCtor = typeof Fuse !== 'undefined'
  ? Fuse
  : typeof require === 'function'
    ? (() => {
      try {
        const fusePackage = require('fuse.js');
        return fusePackage.default || fusePackage;
      } catch {
        // Fallback de última instancia para entornos sin paquetes instalados.
      }

      try {
        const localFuse = require('./fuse.min.js');
        return localFuse.default || localFuse;
      } catch {
        return null;
      }
    })()
    : null;

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function mergeUniqueStrings(items, limit = Number.POSITIVE_INFINITY) {
  const unique = [];
  const seen = new Set();

  items.forEach((item) => {
    if (typeof item !== 'string' || !item.trim()) return;

    const trimmed = item.trim();
    const key = removeDiacritics(trimmed).toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    unique.push(trimmed);
  });

  return unique.slice(0, limit);
}

function normalizeFollowUp(item) {
  return normalizeStringList(item.followUps ?? item.followUp ?? []);
}

function normalizeKeywords(item) {
  return normalizeStringList(item.keywords ?? []);
}

function parseFuseScore(value) {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;

  return parsed;
}

function normalizeBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return false;

  return ['1', 'true', 'yes', 'on', 'si'].includes(value.trim().toLowerCase());
}

function readBrowserStorage(key) {
  if (!hasDocument || typeof window === 'undefined' || !window.localStorage) return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeBrowserStorage(key, value) {
  if (!hasDocument || typeof window === 'undefined' || !window.localStorage) return;

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignora restricciones de almacenamiento del navegador.
  }
}

function resolveLanguageKey(language, availableLanguages = Object.keys(LANGUAGE_CONFIGS)) {
  const normalizedLanguage = typeof language === 'string'
    ? language.trim().toLowerCase()
    : '';

  if (availableLanguages.includes(normalizedLanguage)) {
    return normalizedLanguage;
  }

  if (availableLanguages.includes(DEFAULT_LANGUAGE)) {
    return DEFAULT_LANGUAGE;
  }

  return availableLanguages[0] || DEFAULT_LANGUAGE;
}

function getLanguageConfig(language = currentLanguage) {
  return LANGUAGE_CONFIGS[resolveLanguageKey(language)] || LANGUAGE_CONFIGS[DEFAULT_LANGUAGE];
}

function resolveInitialLanguage() {
  return resolveLanguageKey(
    readRuntimeQueryParam('lang')
    ?? readBrowserStorage(LANGUAGE_STORAGE_KEY)
    ?? DEFAULT_LANGUAGE
  );
}

function resolveLanguageData(data, language = DEFAULT_LANGUAGE) {
  const safeData = data && typeof data === 'object' ? data : {};
  const availableLanguages = Object.keys(safeData).filter((key) => safeData[key] && typeof safeData[key] === 'object');
  const resolvedLanguage = resolveLanguageKey(
    language,
    availableLanguages.length ? availableLanguages : Object.keys(LANGUAGE_CONFIGS)
  );

  return {
    language: resolvedLanguage,
    langData: safeData[resolvedLanguage] || safeData[DEFAULT_LANGUAGE] || safeData.es || null,
  };
}

function buildLanguageResponseState(langData, language = DEFAULT_LANGUAGE) {
  const safeLangData = langData && typeof langData === 'object' ? langData : {};
  const responsesFlat = flattenKnowledgeBase(safeLangData);
  const responses = responsesFlat
    .map((item) => {
      const triggers = buildRegexTriggers(item.trigger);
      if (!triggers.length) return null;

      const normalizedFollowUps = normalizeFollowUp(item);

      return {
        trigger: triggers.length === 1 ? triggers[0] : triggers,
        text: item.answer || item.text,
        imagen: item.image || item.imagen || (item.images ? item.images[0] : null),
        video: item.video || (item.videos ? item.videos[0] : null),
        followUp: normalizedFollowUps,
      };
    })
    .filter(Boolean);

  const staticFallbackSuggestions = getLanguageConfig(language).staticFallbackSuggestions;
  const localizedDefaultFollowUps = mergeUniqueStrings([
    ...normalizeStringList(safeLangData.defaultFollowUps),
    ...staticFallbackSuggestions,
  ]);

  return {
    responses,
    responsesFlat,
    defaultFollowUps: localizedDefaultFollowUps,
  };
}

function updateToggleButtonLabel(isMinimized = chatEl?.classList.contains('chatbot--minimized')) {
  if (!toggleBtn) return;

  const config = getLanguageConfig();
  toggleBtn.setAttribute(
    'aria-label',
    isMinimized ? config.ui.openChatLabel : config.ui.minimizeChatLabel
  );
}

function applyPageMetadata(config = getLanguageConfig()) {
  if (!hasDocument) return;

  const pageConfig = config.page || {};

  pageHeaderTitleEl && (pageHeaderTitleEl.textContent = pageConfig.headerTitle || 'Masclet Bot');
  pageHeaderSubtitleEl && (pageHeaderSubtitleEl.textContent = pageConfig.headerSubtitle || '');

  if (pageConfig.documentTitle) {
    document.title = pageConfig.documentTitle;
  }

  if (pageConfig.documentDescription) {
    descriptionMetaEl?.setAttribute('content', pageConfig.documentDescription);
  }

  document.documentElement?.setAttribute(
    'lang',
    pageConfig.documentLanguage || currentLanguage || DEFAULT_LANGUAGE
  );
}

function applyLanguageUi() {
  if (!hasDocument) return;

  const config = getLanguageConfig();

  applyPageMetadata(config);

  titleEl && (titleEl.textContent = config.ui.title);
  languageLabelEl && (languageLabelEl.textContent = config.ui.languageLabel);
  languageSelectEl && (languageSelectEl.value = currentLanguage);
  languageSelectEl?.setAttribute('aria-label', config.ui.languageLabel);
  chatEl?.setAttribute('aria-label', config.ui.chatAriaLabel);
  messagesEl?.setAttribute('aria-label', config.ui.messagesAriaLabel);
  suggestionsEl?.setAttribute('aria-label', config.ui.suggestionsAriaLabel);
  inputLabelEl && (inputLabelEl.textContent = config.ui.inputLabel);
  if (inputEl) inputEl.placeholder = config.ui.inputPlaceholder;
  sendBtn?.setAttribute('aria-label', config.ui.sendButtonLabel);
  resetBtn?.setAttribute('aria-label', config.ui.resetButtonLabel);
  resetBtn?.setAttribute('title', config.ui.resetButtonTitle);
  updateToggleButtonLabel();
}

currentLanguage = resolveInitialLanguage();

if (hasDocument) {
  applyLanguageUi();
}

function resolveFuseRuntimeConfig(overrides = {}) {
  const directResponseScore = parseFuseScore(overrides.directResponseScore) ?? FUSE_DIRECT_RESPONSE_SCORE;
  const guidanceScore = Math.max(
    parseFuseScore(overrides.guidanceScore) ?? FUSE_GUIDANCE_SCORE,
    directResponseScore
  );

  return {
    directResponseScore,
    guidanceScore,
    debugEnabled: normalizeBooleanFlag(overrides.debug),
  };
}

function getFuseRuntimeConfig() {
  if (!hasDocument || typeof window === 'undefined') {
    return resolveFuseRuntimeConfig();
  }

  let params = null;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    params = null;
  }

  return resolveFuseRuntimeConfig({
    debug: params?.get(FUSE_DEBUG_QUERY_PARAM) ?? readBrowserStorage(FUSE_DEBUG_STORAGE_KEY),
    directResponseScore: params?.get(FUSE_DIRECT_QUERY_PARAM) ?? readBrowserStorage(FUSE_DIRECT_STORAGE_KEY),
    guidanceScore: params?.get(FUSE_GUIDANCE_QUERY_PARAM) ?? readBrowserStorage(FUSE_GUIDANCE_STORAGE_KEY),
  });
}

function sanitizeUserQuery(query) {
  return String(query ?? '')
    .replace(/^\[\d{1,2}:\d{2}\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function looksLikeRegexPattern(value) {
  return /[\\^$.*+?()[\]{}|]/.test(value);
}

function getExplicitRegexTriggerPattern(value) {
  if (typeof value !== 'string') return null;

  const trimmedValue = value.trim();
  if (!trimmedValue.toLowerCase().startsWith(REGEX_TRIGGER_PREFIX)) return null;

  const pattern = trimmedValue.slice(REGEX_TRIGGER_PREFIX.length).trim();
  return pattern || null;
}

function buildLiteralTriggerRegex(value) {
  const tokens = String(value)
    .trim()
    .split(/\s+/)
    .map((token) => escapeRegExp(token));

  return new RegExp(`^\\s*[¿¡]?\\s*${tokens.join('\\s+')}\\s*[?¿!¡.]*\\s*$`, 'i');
}

function normalizeTemporalQuestion(query) {
  return removeDiacritics(sanitizeUserQuery(query))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTemporalAnswer(query) {
  const normalizedQuery = normalizeTemporalQuestion(query);
  if (!normalizedQuery) return null;

  const now = new Date();
  const { dayNames: days, dateLocale } = getLanguageConfig();
  const dayName = days[now.getDay()];
  const dayNumber = now.getDate();
  const monthName = now.toLocaleString(dateLocale || DATE_LOCALE, { month: 'long' });
  const year = now.getFullYear();

  if (/^en que fecha estamos(?: hoy)?$/.test(normalizedQuery)) {
    return { text: `Hoy es ${dayName}, ${dayNumber} de ${monthName} del ${year}.`, followUp: [], imagen: null, video: null };
  }

  if (/^en que ano estamos(?: hoy)?$/.test(normalizedQuery)) {
    return { text: `Estamos en ${year}.`, followUp: [], imagen: null, video: null };
  }

  if (/^(?:que|cual) hora es(?: ahora| hoy)?$/.test(normalizedQuery)) {
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return { text: `La hora actual es ${hours}:${minutes}.`, followUp: [], imagen: null, video: null };
  }

  if (/^(?:que|cual) dia es(?: hoy)?$/.test(normalizedQuery) || /^que dia estamos(?: hoy)?$/.test(normalizedQuery)) {
    return { text: `Hoy es ${dayName}, ${dayNumber} de ${monthName}.`, followUp: [], imagen: null, video: null };
  }

  return null;
}

function buildRegexTriggers(trigger) {
  const rawTriggers = Array.isArray(trigger) ? trigger : [trigger];
  const regexTriggers = [];

  rawTriggers.forEach((entry) => {
    if (entry instanceof RegExp) {
      regexTriggers.push(entry);
      return;
    }

    if (typeof entry !== 'string' || !entry.trim()) return;

    const explicitPattern = getExplicitRegexTriggerPattern(entry);
    const patternSource = explicitPattern ?? entry;

    try {
      regexTriggers.push(
        explicitPattern || looksLikeRegexPattern(patternSource)
          ? new RegExp(patternSource, 'i')
          : buildLiteralTriggerRegex(patternSource)
      );
    } catch {
      regexTriggers.push(buildLiteralTriggerRegex(patternSource));
    }
  });

  return regexTriggers;
}

function triggerToString(trigger) {
  if (!trigger) return '';
  if (trigger instanceof RegExp) return trigger.source;
  if (typeof trigger === 'string') return getExplicitRegexTriggerPattern(trigger) ?? trigger;
  if (Array.isArray(trigger)) {
    return trigger
      .map((entry) => {
        if (entry instanceof RegExp) return entry.source;
        if (typeof entry === 'string') return getExplicitRegexTriggerPattern(entry) ?? entry;
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }
  return String(trigger);
}

function getResultPreviewText(item) {
  const rawText = item?.text ?? item?.answer ?? '';
  const normalizedText = Array.isArray(rawText) ? rawText[0] : rawText;
  return String(normalizedText || '').replace(/\s+/g, ' ').trim();
}

function buildFuseDebugEntry(query, fuseResults, strategy, runtimeConfig = getFuseRuntimeConfig()) {
  return {
    timestamp: new Date().toISOString(),
    query,
    mode: strategy.mode,
    topScore: typeof fuseResults[0]?.score === 'number' ? Number(fuseResults[0].score.toFixed(4)) : null,
    directResponseScore: runtimeConfig.directResponseScore,
    guidanceScore: runtimeConfig.guidanceScore,
    candidates: fuseResults.slice(0, 3).map((result) => ({
      score: typeof result.score === 'number' ? Number(result.score.toFixed(4)) : null,
      trigger: triggerToString(result.item?.trigger),
      preview: getResultPreviewText(result.item).slice(0, 120),
    })),
  };
}

function recordFuseDebugEntry(query, fuseResults, strategy, runtimeConfig = getFuseRuntimeConfig()) {
  if (!runtimeConfig.debugEnabled || !hasDocument || typeof window === 'undefined') return null;

  const entry = buildFuseDebugEntry(query, fuseResults, strategy, runtimeConfig);
  const currentEntries = (() => {
    try {
      const parsed = JSON.parse(readBrowserStorage(FUSE_LOG_STORAGE_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  currentEntries.push(entry);
  writeBrowserStorage(FUSE_LOG_STORAGE_KEY, JSON.stringify(currentEntries.slice(-FUSE_LOG_LIMIT)));
  console.info('[Masclet][Fuse]', entry);
  return entry;
}

function hasTriggerMatch(trigger, query) {
  const triggerList = Array.isArray(trigger) ? trigger : [trigger];
  return triggerList.some((entry) => entry instanceof RegExp && entry.test(query));
}

function findDirectResponse(query, responseList = respuestas) {
  const safeQuery = sanitizeUserQuery(query);
  return responseList.find((response) => hasTriggerMatch(response.trigger, safeQuery)) || null;
}

function checkScreenSize() {
  if (!hasDocument || !chatEl || isStaticChatMode()) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const margin = width <= 768 ? 10 : 20;
  const chatWidth = chatEl.offsetWidth;
  const chatHeight = chatEl.offsetHeight;

  let currentLeft = Number.parseInt(chatEl.style.left, 10);
  let currentTop = Number.parseInt(chatEl.style.top, 10);

  if (Number.isNaN(currentLeft)) currentLeft = width - chatWidth - margin;
  if (Number.isNaN(currentTop)) currentTop = height - chatHeight - margin;

  currentLeft = Math.max(margin, Math.min(currentLeft, Math.max(margin, width - chatWidth - margin)));
  currentTop = Math.max(margin, Math.min(currentTop, Math.max(margin, height - chatHeight - margin)));

  chatEl.style.left = `${currentLeft}px`;
  chatEl.style.top = `${currentTop}px`;
}

// ---- Cargar respuestas desde JSON ----
async function fetchKnowledgeBaseData() {
  if (knowledgeBaseData) return knowledgeBaseData;

  const resp = await fetch(getKnowledgeBaseUrl());
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  knowledgeBaseData = await resp.json();
  return knowledgeBaseData;
}

function applyLanguageData(data, language = currentLanguage) {
  const { language: resolvedLanguage, langData } = resolveLanguageData(data, language);
  if (!langData) {
    throw new Error(`Missing language block for ${resolvedLanguage}`);
  }

  const languageState = buildLanguageResponseState(langData, resolvedLanguage);

  currentLanguage = resolvedLanguage;
  respuestas = languageState.responses;
  respuestasPlanas = languageState.responsesFlat;
  defaultFollowUps = languageState.defaultFollowUps;
  actualizarFuse(respuestasPlanas);

  if (hasDocument) {
    writeBrowserStorage(LANGUAGE_STORAGE_KEY, resolvedLanguage);
    applyLanguageUi();
  }

  return {
    language: resolvedLanguage,
    langData,
  };
}

async function cargarRespuestas(language = currentLanguage) {
  try {
    const data = await fetchKnowledgeBaseData();
    return applyLanguageData(data, language);
  } catch (err) {
    console.error('Error cargando JSON:', err);
    currentLanguage = resolveLanguageKey(language);
    applyLanguageUi();
    typeMessage(getLanguageConfig(currentLanguage).ui.loadErrorText);
    return null;
  }
}

// ---- Función recursiva para aplanar la base de conocimientos ----
function flattenKnowledgeBase(obj) {
  let items = [];
  
  if (Array.isArray(obj)) {
    obj.forEach(val => {
      if (val && typeof val === 'object') {
        if (val.trigger && (val.answer || val.text)) {
          items.push(val);
        } else {
          items = items.concat(flattenKnowledgeBase(val));
        }
      }
    });
  } else if (obj && typeof obj === 'object') {
    for (const key in obj) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        if (val.trigger && (val.answer || val.text)) {
          items.push(val);
        } else {
          items = items.concat(flattenKnowledgeBase(val));
        }
      }
    }
  }
  return items;
}

function buildFuseDataset(data) {
  if (!Array.isArray(data)) return [];

  return data.map((item, index) => {
    const textRaw = item.answer || item.text || '';
    const textForFuse = Array.isArray(textRaw) ? textRaw.join(' ') : String(textRaw);
    const followUp = normalizeFollowUp(item);
    const keywords = normalizeKeywords(item);
    const followUpStr = followUp.join(' ');
    const keywordsStr = keywords.join(' ');
    const triggerStr = triggerToString(item.trigger);
    const idSource = `${triggerStr}|${cleanText(textForFuse)}`;

    return {
      ...item,
      entryId: `${index}:${idSource}`,
      text: textRaw,
      imagen: item.image || item.imagen || (item.images ? item.images[0] : null),
      video: item.video || (item.videos ? item.videos[0] : null),
      followUp,
      keywords,
      normalized: cleanText(textForFuse),
      followUpStr: cleanText(followUpStr),
      keywordsStr: cleanText(keywordsStr),
      triggerStr: cleanText(triggerStr),
      combo: cleanText(`${textForFuse} ${followUpStr} ${triggerStr}`),
    };
  });
}

function dedupeFuseResults(results) {
  const unique = [];
  const seen = new Set();
  const sorted = [...results].sort((a, b) => (a.score ?? 1) - (b.score ?? 1));

  sorted.forEach((result) => {
    const key = result?.item?.entryId || result?.item?.combo;
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(result);
  });

  return unique;
}

function buildFuseQueries(query) {
  const safeQuery = sanitizeUserQuery(query);
  const normalizedQuery = cleanText(safeQuery);
  const semanticQuery = cleanText(analizarConsultaCompromise(safeQuery));

  return [normalizedQuery, semanticQuery]
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function buscarConFuse(query) {
  if (!fuse || !query) return [];

  const queries = buildFuseQueries(query);
  const allResults = queries.flatMap((term) => fuse.search(term, { limit: FUSE_LIMIT }));
  return dedupeFuseResults(allResults);
}

function actualizarFuse(data) {
  if (!FuseCtor) {
    fuse = null;
    return null;
  }

  const dataset = buildFuseDataset(data);
  fuse = new FuseCtor(dataset, FUSE_OPTIONS);
  return fuse;
}

// ---- Añadir mensajes con timestamp ----
function addMessage(text, modifier) {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const timestamp = `[${hours}:${minutes}] `;

  const el = document.createElement('div');
  el.className = `message message--${modifier}`;
  el.textContent = timestamp + text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---- Mostrar sugerencias como botones ----
function showSuggestions(items) {
  suggestionsEl.innerHTML = '';
  if (!items || !items.length) return;

  items.forEach((txt) => {
    const btn = document.createElement('button');
    btn.textContent = txt;
    btn.className = 'suggestions__btn';
    btn.addEventListener('click', () => {
      inputEl.value = txt;
      sendBtn.click();
    });
    suggestionsEl.appendChild(btn);
  });
}

// ---- Efecto de máquina de escribir ----
function typeMessage(text, instant = false) {
  const el = document.createElement('div');
  el.className = 'message message--bot';
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  if (instant) {
    el.textContent = text;
  } else {
    let i = 0;
    const speed = 25;
    const iv = setInterval(() => {
      el.textContent += text.charAt(i);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (++i >= text.length) clearInterval(iv);
    }, speed);
  }
}

// ---- Indicador de "Pensando..." ----
function showThinking() {
  const thinkingEl = document.createElement('div');
  thinkingEl.className = 'message message--bot message--typing';
  thinkingEl.innerHTML = `
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="dot"></span>
  `;
  messagesEl.appendChild(thinkingEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return function removeThinking() {
    if (messagesEl.contains(thinkingEl)) {
      messagesEl.removeChild(thinkingEl);
    }
  };
}

// ---- Historial y control de repeticiones ----
const lastResponses = {};
const repeatCount = {};
const conversationHistory = {};

function clearObjectValues(target) {
  Object.keys(target).forEach((key) => delete target[key]);
}

function resetConversationState({ announcement = null, focusInput = true } = {}) {
  clearObjectValues(lastResponses);
  clearObjectValues(repeatCount);
  clearObjectValues(conversationHistory);

  if (!hasDocument) return;

  messagesEl.innerHTML = '';
  suggestionsEl.innerHTML = '';

  if (announcement) {
    typeMessage(announcement, true);
  }

  if (focusInput) {
    inputEl?.focus();
  }
}

// ---- Estrategia 3 capas: directo -> Fuse -> fallback guiado ----
function getFallbackSuggestionPool(extraSuggestions = []) {
  return mergeUniqueStrings([
    ...normalizeStringList(extraSuggestions),
    ...defaultFollowUps,
  ]);
}

function buildSemanticFallbackSuggestions(query) {
  const normalizedQuery = normalizeTemporalQuestion(query);
  if (!normalizedQuery) return [];

  const suggestionGroups = [
    { keywords: ['falla', 'fallas', 'monumento', 'ninot'], suggestions: ['Plantà', 'Cremà', 'Monumentos falleros'] },
    { keywords: ['comida', 'comer', 'gastronomia', 'dulce', 'postre', 'paella'], suggestions: ['Paella', 'Buñuelos', 'Fartons'] },
    { keywords: ['mascleta', 'pirotecnia', 'petardo', 'petardos', 'fuego'], suggestions: ['Mascletà', 'Normativa de artificios', 'Cremà'] },
    { keywords: ['traje', 'vestido', 'indumentaria', 'ropa', 'fallera', 'fallero'], suggestions: ['Traje de fallera', 'Traje de fallero', 'Peineta'] },
    { keywords: ['ofrenda', 'flores', 'virgen', 'religioso'], suggestions: ['Ofrenda', 'Fallera Mayor', 'Procesiones'] },
  ];

  const matchedGroup = suggestionGroups.find((group) =>
    group.keywords.some((keyword) => normalizedQuery.includes(keyword))
  );

  return matchedGroup ? matchedGroup.suggestions : [];
}

function collectFollowUpsFromFuseResults(results, limit = FALLBACK_SUGGESTION_LIMIT) {
  const followUps = results
    .slice(0, FUSE_GUIDANCE_RESULT_LIMIT)
    .flatMap((result) => normalizeFollowUp(result.item));

  return mergeUniqueStrings(followUps, limit);
}

function buildGuidedFallbackResponse(query, results, fallbackSuggestions = getFallbackSuggestionPool()) {
  const followUp = mergeUniqueStrings([
    ...collectFollowUpsFromFuseResults(results),
    ...buildSemanticFallbackSuggestions(query),
    ...fallbackSuggestions,
  ], FALLBACK_SUGGESTION_LIMIT);

  return {
    text: getLanguageConfig().ui.guidedFallbackText,
    followUp,
    imagen: null,
    video: null,
  };
}

function buildGlobalFallbackResponse(query, fallbackSuggestions = getFallbackSuggestionPool()) {
  const followUp = mergeUniqueStrings([
    ...buildSemanticFallbackSuggestions(query),
    ...fallbackSuggestions,
  ], FALLBACK_SUGGESTION_LIMIT);

  return {
    text: getLanguageConfig().ui.globalFallbackText,
    followUp,
    imagen: null,
    video: null,
  };
}

function evaluateFuseStrategy(query, fuseResults, fallbackSuggestions = getFallbackSuggestionPool(), runtimeConfig = getFuseRuntimeConfig()) {
  if (!Array.isArray(fuseResults) || !fuseResults.length) {
    return {
      mode: 'fallback',
      response: buildGlobalFallbackResponse(query, fallbackSuggestions),
    };
  }

  const [bestResult] = fuseResults;
  const bestScore = bestResult.score ?? 1;

  if (bestScore <= runtimeConfig.directResponseScore) {
    return {
      mode: 'answer',
      item: bestResult.item,
      score: bestScore,
    };
  }

  if (bestScore <= runtimeConfig.guidanceScore) {
    return {
      mode: 'guided-fallback',
      response: buildGuidedFallbackResponse(query, fuseResults, fallbackSuggestions),
      score: bestScore,
    };
  }

  return {
    mode: 'fallback',
    response: buildGlobalFallbackResponse(query, fallbackSuggestions),
    score: bestScore,
  };
}

function resolveResponseStrategy(query, directResponses = respuestas, fuseResults = [], fallbackSuggestions = getFallbackSuggestionPool(), runtimeConfig = getFuseRuntimeConfig()) {
  const directMatch = findDirectResponse(query, directResponses);
  if (directMatch) {
    return {
      mode: 'direct',
      item: directMatch,
    };
  }

  return evaluateFuseStrategy(query, fuseResults, fallbackSuggestions, runtimeConfig);
}

function buildResponsePayload(item, queryKey) {
  const responseKey = triggerToString(item.trigger) || JSON.stringify(item.text);
  let responseText = item.text;

  if (Array.isArray(item.text)) {
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * item.text.length);
    } while (item.text.length > 1 && lastResponses[responseKey] === randomIndex);

    lastResponses[responseKey] = randomIndex;
    responseText = item.text[randomIndex];
  }

  if (repeatCount[queryKey] > 3) {
    responseText += ' (Ya me lo habías preguntado, pero aquí va una nueva pista.)';
  }

  return {
    text: responseText,
    followUp: item.followUp || [],
    imagen: item.imagen || null,
    video: item.video || null,
  };
}

// ---- Motor de respuestas ----
async function responder(q) {
  const safeQuery = sanitizeUserQuery(q);
  const temporalAnswer = getTemporalAnswer(safeQuery);
  if (temporalAnswer) return temporalAnswer;

  const queryKey = safeQuery.toLowerCase();
  repeatCount[queryKey] = (repeatCount[queryKey] || 0) + 1;

  const fallbackSuggestions = getFallbackSuggestionPool();
  const fuseResults = buscarConFuse(safeQuery);
  const runtimeConfig = getFuseRuntimeConfig();
  const strategy = resolveResponseStrategy(safeQuery, respuestas, fuseResults, fallbackSuggestions, runtimeConfig);

  recordFuseDebugEntry(safeQuery, fuseResults, strategy, runtimeConfig);

  if (strategy.mode === 'direct' || strategy.mode === 'answer') {
    return buildResponsePayload(strategy.item, queryKey);
  }

  return strategy.response;
}

// ---- Manejar pregunta del usuario ----
async function handleQuestion(q) {
  suggestionsEl.innerHTML = '';
  const stop = showThinking();
  await new Promise((r) => setTimeout(r, 800));
  stop();

  const queryKey = q.toLowerCase();
  let { text, followUp, imagen, video } = await responder(q);

  if (conversationHistory[queryKey]) {
    conversationHistory[queryKey].count++;
    if (conversationHistory[queryKey].count > 3) {
      const result = await responder(q);
      text = `Ya me preguntaste eso (${conversationHistory[queryKey].count} veces), pero te lo recuerdo: ${result.text}`;
      conversationHistory[queryKey].baseResponse = result.text;
      followUp = result.followUp;
      imagen = result.imagen;
      video = result.video;
    } else {
      text = `Ya me preguntaste eso (${conversationHistory[queryKey].count} veces), pero te lo recuerdo: ${conversationHistory[queryKey].baseResponse}`;
    }
  } else {
    conversationHistory[queryKey] = { count: 1, baseResponse: text };
  }

  text = addContextualData(text);

  try {
    typeMessage(text);
    const delay = text.length * 25 + 250;

    setTimeout(() => {
      // Mostrar imágenes
      if (imagen) {
        const imgs = Array.isArray(imagen) ? imagen : [imagen];
        imgs.forEach((url) => {
          const imgEl = document.createElement('img');
          imgEl.src = url;
          imgEl.alt = 'Imagen de respuesta';
          imgEl.className = 'message__image';
          messagesEl.appendChild(imgEl);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      // Mostrar vídeos
      if (video) {
        const vids = Array.isArray(video) ? video : [video];
        vids.forEach((url) => {
          const iframe = document.createElement('iframe');
          iframe.src = convertYoutube(url);
          iframe.title = 'Video de respuesta';
          iframe.className = 'message__video';
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
          iframe.allowFullscreen = true;
          messagesEl.appendChild(iframe);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      // Mostrar sugerencias con delay
      if (followUp && followUp.length) {
        setTimeout(() => showSuggestions(followUp), text.length * 25 + 200);
      }
      
      // Reiniciar iconos de lucide por si hubo inyecciones extra
      if (window.lucide) window.lucide.createIcons();
    }, delay);
  } catch (err) {
    console.error(err);
    typeMessage(getLanguageConfig().ui.unexpectedErrorText);
  }
}

if (hasDocument) {
  sendBtn?.addEventListener('click', () => {
    const q = inputEl.value.trim();
    if (!q) return;
    addMessage(q, 'user');
    inputEl.value = '';
    handleQuestion(q);
  });

  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendBtn.click();
  });

  languageSelectEl?.addEventListener('change', async (e) => {
    const nextLanguage = e.target.value;
    const result = await cargarRespuestas(nextLanguage);
    if (!result) return;

    resetConversationState({
      announcement: getLanguageConfig().ui.welcomeMessage,
    });
  });

  resetBtn?.addEventListener('click', () => {
    resetConversationState({
      announcement: getLanguageConfig().ui.resetMessage,
    });
  });
}

// ---- Exportaciones para tests (Jest) ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanText,
    flattenKnowledgeBase,
    removeDiacritics,
    analizarConsultaCompromise,
    buildRegexTriggers,
    buildFuseDataset,
    actualizarFuse,
    buscarConFuse,
    sanitizeUserQuery,
    getTemporalAnswer,
    resolveLanguageKey,
    resolveLanguageData,
    buildLanguageResponseState,
    getLanguageConfig,
    applyPageMetadata,
    findDirectResponse,
    collectFollowUpsFromFuseResults,
    resolveFuseRuntimeConfig,
    buildFuseDebugEntry,
    evaluateFuseStrategy,
    resolveResponseStrategy,
    buildGlobalFallbackResponse,
  };
}

// ---- Datos contextuales (saludo según hora) ----
function addContextualData(text) {
  const config = getLanguageConfig();
  const now = new Date();
  const hour = now.getHours();
  let saludoContextual = '';

  if (hour < 12) {
    saludoContextual = config.ui.contextualGreetings.morning;
  } else if (hour < 18) {
    saludoContextual = config.ui.contextualGreetings.afternoon;
  } else {
    saludoContextual = config.ui.contextualGreetings.evening;
  }

  if (config.ui.greetingMatcher.test(text)) {
    return saludoContextual + ' ' + text;
  }
  return text;
}

// ---- Mostrar agrupados (utilidad) ----
function mostrarAgrupados(agrupados) {
  for (const categoria in agrupados) {
    const titulo = document.createElement('h4');
    titulo.textContent = '📂 ' + categoria;
    titulo.style.marginTop = '20px';
    messagesEl.appendChild(titulo);

    agrupados[categoria].forEach((res) => {
      const respuesta = document.createElement('p');
      respuesta.textContent = '🔹 ' + res.item.text;
      respuesta.style.marginLeft = '10px';
      messagesEl.appendChild(respuesta);
    });
  }
}

if (hasDocument) {
  window.onload = async () => {
    const result = await cargarRespuestas(currentLanguage);
    if (result) {
      resetConversationState({
        announcement: getLanguageConfig().ui.welcomeMessage,
      });
    }
    checkScreenSize();
  };
}
