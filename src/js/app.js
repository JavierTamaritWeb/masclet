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
const toggleBtn = hasDocument ? document.querySelector('.chatbot__toggle') : null;
const messagesEl = hasDocument ? document.querySelector('.chatbot__body') : null;
const suggestionsEl = hasDocument ? document.querySelector('.suggestions') : null;
const inputEl = hasDocument ? document.querySelector('.input-area__field') : null;
const sendBtn = hasDocument ? document.querySelector('.input-area__send') : null;
const resetBtn = hasDocument ? document.querySelector('.input-area__reset') : null;
const wrapper = hasDocument ? document.querySelector('.chat-wrapper') : null;

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
    if (e.target === toggleBtn) return;
    dragging = true;
    chatEl.style.right = 'auto';
    chatEl.style.bottom = 'auto';
    const r = chatEl.getBoundingClientRect();
    dx = e.clientX - r.left;
    dy = e.clientY - r.top;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
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
  });

  window.addEventListener('resize', checkScreenSize);
}

// ---- Variables globales para respuestas ----
let respuestas = [];
let fuse;
let respuestasPlanas = [];
let defaultFollowUps = [];

// ---- Configuración de búsqueda difusa ----
const DEFAULT_LANGUAGE = 'es';
const DATE_LOCALE = 'es-ES';
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

function buildLiteralTriggerRegex(value) {
  const tokens = String(value)
    .trim()
    .split(/\s+/)
    .map((token) => escapeRegExp(token));

  return new RegExp(`^\\s*${tokens.join('\\s+')}\\s*[?¿!¡.]*\\s*$`, 'i');
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
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayName = days[now.getDay()];
  const dayNumber = now.getDate();
  const monthName = now.toLocaleString(DATE_LOCALE, { month: 'long' });
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

    try {
      regexTriggers.push(
        looksLikeRegexPattern(entry)
          ? new RegExp(entry, 'i')
          : buildLiteralTriggerRegex(entry)
      );
    } catch {
      regexTriggers.push(buildLiteralTriggerRegex(entry));
    }
  });

  return regexTriggers;
}

function triggerToString(trigger) {
  if (!trigger) return '';
  if (trigger instanceof RegExp) return trigger.source;
  if (Array.isArray(trigger)) {
    return trigger
      .map((entry) => {
        if (entry instanceof RegExp) return entry.source;
        if (typeof entry === 'string') return entry;
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
  if (!hasDocument || !chatEl) return;

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
async function cargarRespuestas() {
  try {
    const resp = await fetch('data/knowledgeBase.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    
    // Asumimos español por defecto ("es")
    const langData = data[DEFAULT_LANGUAGE] || data.es || data;
    defaultFollowUps = mergeUniqueStrings([
      ...normalizeStringList(langData.defaultFollowUps),
      ...STATIC_FALLBACK_SUGGESTIONS,
    ]);
    respuestasPlanas = flattenKnowledgeBase(langData);

    respuestas = respuestasPlanas
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

    actualizarFuse(respuestasPlanas);
  } catch (err) {
    console.error('Error cargando JSON:', err);
    typeMessage('¡Uy! No he podido cargar mis respuestas.');
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

// ---- Estrategia 3 capas: directo -> Fuse -> fallback guiado ----
function getFallbackSuggestionPool(extraSuggestions = []) {
  return mergeUniqueStrings([
    ...normalizeStringList(extraSuggestions),
    ...defaultFollowUps,
    ...STATIC_FALLBACK_SUGGESTIONS,
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
    text: 'No tengo una coincidencia exacta, pero estas sugerencias están cerca de lo que buscas.',
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
    text: 'No encontré una coincidencia clara, pero puedo orientarte con estas sugerencias.',
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
    typeMessage('¡Ups! Algo falló.');
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

  resetBtn?.addEventListener('click', () => {
    messagesEl.innerHTML = '';
    suggestionsEl.innerHTML = '';
    Object.keys(conversationHistory).forEach((key) => delete conversationHistory[key]);
    typeMessage('¡Aquí estoy de nuevo! ¿Qué necesitas?', true);
    inputEl.focus();
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
  const now = new Date();
  const hour = now.getHours();
  let saludoContextual = '';

  if (hour < 12) {
    saludoContextual = '¡Buenos días!';
  } else if (hour < 18) {
    saludoContextual = '¡Buenas tardes!';
  } else {
    saludoContextual = '¡Buenas noches!';
  }

  if (/hola|salúdame/i.test(text)) {
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
    inputEl?.focus();
    await cargarRespuestas();
    typeMessage('¡BOOM! 🎇 Soy Masclet. Salúdame con "hola".', true);
    checkScreenSize();
  };
}
