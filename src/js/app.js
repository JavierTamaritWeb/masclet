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
const STOP_WORDS_BY_LANGUAGE = {
  es: [
    'el', 'la', 'los', 'las', 'de', 'del', 'y', 'a', 'en',
    'con', 'para', 'por', 'al', 'ante', 'bajo', 'cabe', 'desde',
    'durante', 'excepto', 'mediante', 'según', 'sin', 'tras',
  ],
  va: [
    'el', 'la', 'els', 'les', 'de', 'del', 'i', 'a', 'en',
    'amb', 'per', 'al', 'des', 'sense', 'entre', 'sobre',
    'dins', 'fins', 'cap', 'sota', 'segons',
  ],
  en: [
    'the', 'a', 'an', 'of', 'and', 'in', 'on', 'at', 'to',
    'for', 'with', 'by', 'from', 'is', 'are', 'was', 'were',
    'it', 'its', 'this', 'that', 'these', 'those',
  ],
  fr: [
    'le', 'la', 'les', 'de', 'du', 'des', 'et', 'à', 'en',
    'un', 'une', 'au', 'aux', 'par', 'pour', 'sur', 'dans',
    'avec', 'sans', 'entre', 'sous', 'ce', 'cette', 'ces',
  ],
};
const stopWordsList = STOP_WORDS_BY_LANGUAGE.es;

function createStopWordsRegex(list) {
  const pattern = '\\b(' + list.join('|') + ')\\b';
  return new RegExp(pattern, 'gi');
}

const stopWords = createStopWordsRegex(stopWordsList);
const STOP_WORDS_REGEX_BY_LANGUAGE = Object.fromEntries(
  Object.entries(STOP_WORDS_BY_LANGUAGE).map(([lang, list]) => [lang, createStopWordsRegex(list)])
);

// ---- Utilidades de texto ----
function removeDiacritics(str) {
  if (typeof str !== 'string') return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanText(text, language) {
  if (!text) return '';
  // Si es un array (como saludos variados), lo unimos para normalizarlo todo
  const str = Array.isArray(text) ? text.join(' ') : String(text);
  let cleaned = removeDiacritics(str).toLowerCase();
  const langStopWords = (language && STOP_WORDS_REGEX_BY_LANGUAGE[language]) || stopWords;
  cleaned = cleaned.replace(langStopWords, '');
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
      anaphoricResponseText: '¡Aquí tienes más sobre ese tema!',
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
      anaphoricResponseText: 'Ací tens més sobre eixe tema!',
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
      anaphoricResponseText: 'Here\'s more on that topic!',
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
      anaphoricResponseText: 'Voici plus d\'informations sur ce sujet !',
      contextualGreetings: {
        morning: 'Bonjour !',
        afternoon: 'Bon après-midi !',
        evening: 'Bonsoir !',
      },
      greetingMatcher: /bonjour|salut|coucou/i,
    },
  },
};
const TEMPORAL_NORMALIZATION_RULES = {
  es: [
    [/\bdias\b/g, 'dia'],
    [/\bfechas\b/g, 'fecha'],
    [/\bhoras\b/g, 'hora'],
    [/\banos\b/g, 'ano'],
  ],
  va: [
    [/\bdies\b/g, 'dia'],
    [/\bdates\b/g, 'data'],
    [/\bhores\b/g, 'hora'],
    [/\banys\b/g, 'any'],
  ],
  en: [
    [/\bdays\b/g, 'day'],
    [/\bdates\b/g, 'date'],
    [/\bhours\b/g, 'hour'],
    [/\byears\b/g, 'year'],
    [/\bwhat s\b/g, 'what is'],
    [/\btoday s\b/g, 'today'],
  ],
  fr: [
    [/\bjours\b/g, 'jour'],
    [/\bheures\b/g, 'heure'],
    [/\bannees\b/g, 'annee'],
    [/\bd aujourd hui\b/g, 'aujourd hui'],
  ],
};
const TEMPORAL_INTENT_PATTERNS = {
  es: {
    date: [
      /^(?:dime\s+)?(?:en\s+)?que\s+fecha\s+(?:estamos|es)(?:\s+hoy)?$/,
      /^(?:dime\s+)?(?:que|cual)\s+es\s+(?:la\s+)?fecha(?:\s+(?:de\s+)?hoy)?$/,
      /^(?:la\s+)?fecha(?:\s+(?:de\s+)?hoy)?$/,
    ],
    year: [
      /^(?:dime\s+)?(?:en\s+)?que\s+ano\s+estamos(?:\s+hoy)?$/,
      /^(?:dime\s+)?(?:que|cual)\s+es\s+(?:el\s+)?ano(?:\s+(?:actual|de\s+hoy))?$/,
      /^(?:el\s+)?ano\s+actual$/,
    ],
    time: [
      /^(?:dime\s+)?(?:que|cual)\s+hora\s+(?:es|son)(?:\s+(?:ahora|hoy))?$/,
      /^(?:dime\s+)?(?:que|cual)\s+hora\s+tenemos(?:\s+ahora)?$/,
      /^(?:la\s+)?hora\s+(?:actual|de\s+ahora)$/,
    ],
    day: [
      /^(?:dime\s+)?(?:que|cual)\s+(?:el\s+)?dia\s+(?:es|estamos)(?:\s+hoy)?$/,
      /^(?:en\s+)?que\s+dia\s+estamos(?:\s+hoy)?$/,
      /^(?:dime\s+)?(?:que|cual)\s+es\s+(?:el\s+)?dia(?:\s+de)?(?:\s+hoy)?$/,
    ],
  },
  va: {
    date: [
      /^(?:digues(?:\s+me)?\s+)?(?:en\s+)?quina\s+data\s+(?:estem|es)(?:\s+(?:hui|avui))?$/,
      /^(?:digues(?:\s+me)?\s+)?(?:quina|que)\s+es\s+(?:la\s+)?data(?:\s+(?:de\s+)?(?:hui|avui))?$/,
      /^(?:la\s+)?data(?:\s+(?:de\s+)?(?:hui|avui))?$/,
    ],
    year: [
      /^(?:digues(?:\s+me)?\s+)?(?:en\s+)?quin\s+any\s+estem(?:\s+(?:hui|avui))?$/,
      /^(?:digues(?:\s+me)?\s+)?(?:quin|que)\s+es\s+(?:l\s+)?any(?:\s+(?:actual|de\s+(?:hui|avui)))?$/,
      /^(?:l\s+)?any\s+actual$/,
    ],
    time: [
      /^(?:digues(?:\s+me)?\s+)?quina\s+hora\s+(?:es|son)(?:\s+(?:ara|hui|avui))?$/,
      /^(?:digues(?:\s+me)?\s+)?quina\s+hora\s+tenim(?:\s+ara)?$/,
      /^(?:l\s+)?hora\s+(?:actual|d\s+ara)$/,
    ],
    day: [
      /^(?:digues(?:\s+me)?\s+)?(?:quin|que)\s+(?:el\s+)?dia\s+(?:es|estem)(?:\s+(?:hui|avui))?$/,
      /^(?:en\s+)?quin\s+dia\s+estem(?:\s+(?:hui|avui))?$/,
      /^(?:digues(?:\s+me)?\s+)?(?:quin|que)\s+es\s+(?:el\s+)?dia(?:\s+de)?(?:\s+(?:hui|avui))?$/,
    ],
  },
  en: {
    date: [
      /^(?:tell\s+me\s+)?what\s+is\s+(?:the\s+)?date(?:\s+today)?$/,
      /^(?:tell\s+me\s+)?what\s+date\s+is\s+it(?:\s+today)?$/,
      /^(?:the\s+)?date(?:\s+today)?$/,
      /^date\s+today$/,
    ],
    year: [
      /^(?:tell\s+me\s+)?what\s+year\s+is\s+it(?:\s+today)?$/,
      /^(?:tell\s+me\s+)?what\s+year\s+are\s+we\s+in(?:\s+today)?$/,
      /^(?:tell\s+me\s+)?which\s+year\s+are\s+we\s+in(?:\s+today)?$/,
      /^(?:the\s+)?current\s+year$/,
    ],
    time: [
      /^(?:tell\s+me\s+)?what\s+(?:time|hour)\s+is\s+it(?:\s+(?:now|today))?$/,
      /^(?:the\s+)?current\s+time$/,
      /^time\s+now$/,
    ],
    day: [
      /^(?:tell\s+me\s+)?what\s+day\s+is\s+it(?:\s+today)?$/,
      /^(?:tell\s+me\s+)?which\s+day\s+is\s+it(?:\s+today)?$/,
      /^(?:tell\s+me\s+)?what\s+is\s+(?:the\s+)?day(?:\s+today)?$/,
    ],
  },
  fr: {
    date: [
      /^(?:dis(?:\s+moi)?\s+)?quelle\s+date\s+(?:sommes\s+nous|est(?:\s+ce)?)?(?:\s+aujourd\s+hui)?$/,
      /^(?:dis(?:\s+moi)?\s+)?quelle\s+est\s+(?:la\s+)?date(?:\s+aujourd\s+hui)?$/,
      /^(?:la\s+)?date(?:\s+aujourd\s+hui)?$/,
    ],
    year: [
      /^(?:dis(?:\s+moi)?\s+)?en\s+quelle\s+annee\s+sommes\s+nous(?:\s+aujourd\s+hui)?$/,
      /^(?:dis(?:\s+moi)?\s+)?quelle\s+annee\s+(?:sommes\s+nous|est(?:\s+ce)?)$/,
      /^(?:l\s+)?annee\s+actuelle$/,
    ],
    time: [
      /^(?:dis(?:\s+moi)?\s+)?quelle\s+heure\s+est\s+il(?:\s+maintenant)?$/,
      /^(?:dis(?:\s+moi)?\s+)?il\s+est\s+quelle\s+heure(?:\s+maintenant)?$/,
      /^(?:l\s+)?heure\s+actuelle$/,
    ],
    day: [
      /^(?:dis(?:\s+moi)?\s+)?quel\s+jour\s+(?:sommes\s+nous|est(?:\s+ce)?)?(?:\s+aujourd\s+hui)?$/,
      /^(?:dis(?:\s+moi)?\s+)?quel\s+est\s+(?:le\s+)?jour(?:\s+aujourd\s+hui)?$/,
    ],
  },
};
const TEMPORAL_RESPONSE_BUILDERS = {
  es: {
    date: ({ dayName, dayNumber, monthName, year }) => `Hoy es ${dayName}, ${dayNumber} de ${monthName} del ${year}.`,
    year: ({ year }) => `Estamos en ${year}.`,
    time: ({ hours, minutes }) => `La hora actual es ${hours}:${minutes}.`,
    day: ({ dayName, dayNumber, monthName }) => `Hoy es ${dayName}, ${dayNumber} de ${monthName}.`,
  },
  va: {
    date: ({ dayName, dayNumber, monthName, year }) => `Hui és ${dayName}, ${dayNumber} de ${monthName} del ${year}.`,
    year: ({ year }) => `Estem en ${year}.`,
    time: ({ hours, minutes }) => `L'hora actual és ${hours}:${minutes}.`,
    day: ({ dayName, dayNumber, monthName }) => `Hui és ${dayName}, ${dayNumber} de ${monthName}.`,
  },
  en: {
    date: ({ dayName, dayNumber, monthName, year }) => `Today is ${dayName}, ${dayNumber} ${monthName} ${year}.`,
    year: ({ year }) => `We are in ${year}.`,
    time: ({ hours, minutes }) => `The current time is ${hours}:${minutes}.`,
    day: ({ dayName, dayNumber, monthName }) => `Today is ${dayName}, ${dayNumber} ${monthName}.`,
  },
  fr: {
    date: ({ dayName, dayNumber, monthName, year }) => `Nous sommes ${dayName} ${dayNumber} ${monthName} ${year}.`,
    year: ({ year }) => `Nous sommes en ${year}.`,
    time: ({ hours, minutes }) => `Il est ${hours}:${minutes}.`,
    day: ({ dayName, dayNumber, monthName }) => `Nous sommes ${dayName} ${dayNumber} ${monthName}.`,
  },
};
const CASCADE_FAMILY_ORDER = ['conversation', 'personality', 'events', 'history', 'organization', 'logistics', 'gastronomy', 'attire'];
const CASCADE_PATH_PATTERNS = {
  events: [/^festejosreligiosos/, /^festejospopulares/, /^monumentos/],
  history: [/^festejospopulares\.historia/, /^knowledgebase/],
  organization: [/^festejospopulares\.organizacion/, /^puestospersonal/],
  logistics: [/^festejospopulares\.logistica/],
  gastronomy: [/^comidatipica/],
  attire: [/^vestimenta/],
};
const CASCADE_QUERY_PATTERNS = {
  es: {
    conversation: [
      /^(?:hola(?:\s+(?:masclet|bot))?|buen(?:os\s+dias?|as\s+tardes|as\s+noches)|saludos?|ey|hey|como\s+estas?|que\s+tal|todo\s+bien|necesito\s+ayuda|me\s+ayudas?|puedes\s+ayudarme|dime\s+algo|quiero\s+info(?:rmacion)?|dame\s+info(?:rmacion)?)$/,
    ],
    personality: [
      /(?:como\s+te\s+llamas|quien\s+eres|cual\s+es\s+tu\s+nombre|que\s+color\s+te\s+gusta|color\s+favorit|petardo\s+favorit|olor\s+favorit|que\s+olor\s+te\s+gusta|polvora)/,
    ],
    events: [
      /\b(?:mascleta|masclet|crema|ofrenda|virgen|crida|planta|ninot|procesion(?:es)?|fallera\s+mayor|monumento(?:s)?|falla(?:s)?|desperta|cabalgata|alba\s+falles|nit\s+del\s+foc|fuegos\s+artificiales|exposicion\s+(?:del\s+)?ninot|ninot\s+indultat|llibret|misa\s+solemne|decibelios)\b/,
    ],
    history: [
      /\b(?:origen|historia|parot|carpinteros|facula|tradicion|fundacion|suspendid|cancelad|primer\s+documento|traca|1777|1886|1939|gremio|mitja\s+quaresma|cruilles|etimologia|significa(?:do)?\s+falla)\b/,
    ],
    organization: [
      /\b(?:jcf|junta\s+central|comision(?:es)?\s+fallera|presidente|interagrupacion|gala\s+(?:de\s+la\s+)?(?:indumentaria|pirotecnia)|normativa|organiza|sede\s+(?:de\s+la\s+)?jcf|puestos?\s+directivos?)\b/,
    ],
    logistics: [
      /\b(?:aparcar|parking|transporte|ropa\s+crema|zonas?\s+tranquil|asfalto|arena|carpas?|accesibilidad|verbenas?|pmr|movilidad\s+reducida|calles\s+cortadas|proteccion\s+(?:del\s+)?(?:asfalto|suelo))\b/,
    ],
    gastronomy: [
      /\b(?:paella|arroz|socarrat|bunuelos?|bunyols|horchata|fartons?|churros?|dulces?|postres?|reposteria|comida\s+valenciana|boniato|esmorcar|almuerzo|cremaet|cremat)\b/,
    ],
    attire: [
      /\b(?:vestimenta|indumentaria|traje|vestido|fallera|fallero|peineta|manteleta|aderezo|barretina|faja|faixa|corpino|corpi[nñ]o|espolines?|rodetes?|rascamonyos?|pinta|ahuecador|alcaor|bluson|pa[nñ]uelo|sarag[uü]ell|torrent[ií]|mocador|negrilla|chopet[ií]|chambra|mantilla|enaguas?|postice?r[ií]a|joia|espejuelos?|mallas?|farolet|orfebrer[ií]a|orfebres?|pinchos?|bunyols?\s+d[']?or)\b/,
    ],
  },
  va: {
    conversation: [
      /^(?:hola(?:\s+(?:masclet|bot))?|salutacions?|ei|hey|com\s+estas?|com\s+va|tot\s+be|necessite\s+ajuda|em\s+pots\s+ajudar|digues\s+algo|vull\s+informacio)$/,
    ],
    personality: [
      /(?:com\s+te\s+dius|qui\s+eres|qui\s+ets|quin\s+es\s+el\s+teu\s+nom|quin\s+color\s+t\s+agrada|color\s+favorit|petard\s+favorit|quina\s+olor\s+t\s+agrada|polvora)/,
    ],
    events: [
      /\b(?:mascleta|masclet|crema|ofrena|verge|crida|planta|ninot|processo|processons?|fallera\s+major|monument(?:s)?|falla(?:es)?|desperta|cavalcada|alba\s+falles|nit\s+del\s+foc|focs\s+artificials|exposicio\s+(?:del\s+)?ninot)\b/,
    ],
    history: [
      /\b(?:origen|historia|parot|fusters|facula|tradicio|fundacio|suspes|cancelad|primer\s+document|traca|1777|1886|1939|gremi|mitja\s+quaresma)\b/,
    ],
    organization: [
      /\b(?:jcf|junta\s+central|comissio|president|interagrupacio|gala|normativa|organitza|seu\s+jcf)\b/,
    ],
    logistics: [
      /\b(?:aparcar|parking|transport|roba\s+crema|zones?\s+tranquil|asfalt|arena|carpes?|accessibilitat|verbenes?|pmr|mobilitat\s+reduida)\b/,
    ],
    gastronomy: [
      /\b(?:paella|arros|socarrat|bunyols?|orxata|fartons?|xurros?|dolcos?|postres?|rebosteria|menjar\s+valencia|moniato)\b/,
    ],
    attire: [
      /\b(?:indumentaria|vestit|vestimenta|fallera|faller|pinta|manteleta|adrec|barretina|faixa|cosset)\b/,
    ],
  },
  en: {
    conversation: [
      /^(?:hello(?:\s+masclet)?|hi(?:\s+masclet)?|greetings|how\s+are\s+you|what\s+s\s+up|i\s+need\s+help|can\s+you\s+help\s+me|tell\s+me\s+something|i\s+want\s+information)$/,
    ],
    personality: [
      /(?:who\s+are\s+you|what\s+is\s+your\s+name|favorite\s+color|favorite\s+firecracker|what\s+smell\s+do\s+you\s+like|gunpowder)/,
    ],
    events: [
      /\b(?:mascleta|masclet|crema|offering|virgin|crida|planta|ninot|procession(?:s)?|fallera\s+mayor|monument(?:s)?|fallas?|fireworks|exhibition)\b/,
    ],
    history: [
      /\b(?:origin|history|parot|carpenters|tradition|founded|suspended|cancelled|first\s+document|1777|1886|1939)\b/,
    ],
    organization: [
      /\b(?:jcf|central\s+board|commission|president|organization|gala|regulations|headquarters)\b/,
    ],
    logistics: [
      /\b(?:parking|transport|clothing\s+crema|quiet\s+areas?|asphalt|sand|tents?|accessibility|reduced\s+mobility)\b/,
    ],
    gastronomy: [
      /\b(?:paella|rice|socarrat|fritter(?:s)?|horchata|fartons?|churros?|sweets?|desserts?|pastries|food)\b/,
    ],
    attire: [
      /\b(?:attire|dress|clothing|fallera|fallero|comb|mantilla|adornment|barretina|sash|bodice)\b/,
    ],
  },
  fr: {
    conversation: [
      /^(?:bonjour(?:\s+masclet)?|salut(?:\s+masclet)?|coucou|comment\s+ca\s+va|j\s+ai\s+besoin\s+d\s+aide|peux\s+tu\s+m\s+aider|dis\s+moi\s+quelque\s+chose|je\s+veux\s+des\s+informations)$/,
    ],
    personality: [
      /(?:qui\s+es\s+tu|quel\s+est\s+ton\s+nom|couleur\s+preferee|petard\s+prefere|quelle\s+odeur\s+aimes\s+tu|poudre)/,
    ],
    events: [
      /\b(?:mascleta|masclet|crema|offrande|vierge|crida|planta|ninot|procession(?:s)?|fallera\s+mayor|monument(?:s)?|fallas?|feux\s+d\s+artifice|exposition)\b/,
    ],
    history: [
      /\b(?:origine|histoire|parot|charpentiers|tradition|fondation|suspendu|annule|premier\s+document|1777|1886|1939)\b/,
    ],
    organization: [
      /\b(?:jcf|junte\s+centrale|commission|president|organisation|gala|reglements|siege)\b/,
    ],
    logistics: [
      /\b(?:parking|stationner|transport|vetements?\s+crema|zones?\s+tranquill|asphalte|sable|chapiteaux?|accessibilite|mobilite\s+reduite)\b/,
    ],
    gastronomy: [
      /\b(?:paella|riz|socarrat|beignet(?:s)?|horchata|farton(?:s)?|churros?|douceurs?|desserts?|patisserie|gastronomie)\b/,
    ],
    attire: [
      /\b(?:tenue|robe|vetement|fallera|fallero|peigne|mantille|ornement|barretina|ceinture|corsage)\b/,
    ],
  },
};
const CASCADE_RESPONSE_PATTERNS = {
  es: {
    conversation: [/\b(?:hola|saludos?|bienvenida|ayuda|informacion|consultas|asistente|masclet\s+bot)\b/],
    personality: [/\b(?:masclet|color\s+favorito|petardo\s+favorito|olor\s+favorito|tro\s+de\s+bac|polvora)\b/],
    events: [/\b(?:mascleta|masclet|crema|ofrenda|virgen|crida|planta|ninot|procesion(?:es)?|fallera\s+mayor|monumento(?:s)?|falla(?:s)?|desperta|cabalgata|nit\s+del\s+foc|fuegos\s+artificiales|exposicion|indultat|llibret|decibelios)\b/],
    history: [/\b(?:origen|historia|parot|carpinteros|facula|tradicion|fundacion|suspendid|cancelad|traca|gremio|mitja\s+quaresma|1777|1886|1939)\b/],
    organization: [/\b(?:jcf|junta\s+central|comision(?:es)?|presidente|interagrupacion|gala|normativa|organiza)\b/],
    logistics: [/\b(?:aparcar|parking|transporte|ropa|zonas?\s+tranquil|asfalto|arena|carpas?|accesibilidad|verbenas?|pmr|movilidad\s+reducida)\b/],
    gastronomy: [/\b(?:paella|arroz|socarrat|bunuelos?|bunyols|horchata|fartons?|churros?|dulces?|postres?|reposteria|boniato|esmorcar|cremaet)\b/],
    attire: [/\b(?:vestimenta|indumentaria|traje|vestido|fallera|fallero|peineta|manteleta|aderezo|barretina|faja|faixa|corpino|corpiño|espolines?|rodetes?|rascamonyos?|ahuecador|bluson|panuelo|sarag[uü]ell|torrent[ií]|mocador|negrilla|chopet[ií]|chambra|mantilla|enaguas?|postice?r[ií]a|joia|espejuelos?|mallas?|farolet|orfebrer[ií]a|orfebres?|pinchos?|bunyols?\s+d[']?or)\b/],
  },
  va: {
    conversation: [/\b(?:hola|salutacions?|ajuda|informacio|assistent|bot\s+faller)\b/],
    personality: [/\b(?:masclet|color\s+favorit|petard\s+favorit|olor\s+favorita?|tro\s+de\s+bac|polvora)\b/],
    events: [/\b(?:mascleta|masclet|crema|ofrena|verge|crida|planta|ninot|processons?|fallera\s+major|monument(?:s)?|falla(?:es)?|desperta|cavalcada|nit\s+del\s+foc)\b/],
    history: [/\b(?:origen|historia|parot|fusters|tradicio|fundacio|suspes|cancelad|traca|gremi|mitja\s+quaresma)\b/],
    organization: [/\b(?:jcf|junta\s+central|comissio|president|interagrupacio|gala|normativa|organitza)\b/],
    logistics: [/\b(?:aparcar|parking|transport|roba|zones?\s+tranquil|asfalt|arena|carpes?|accessibilitat|verbenes?|pmr|mobilitat)\b/],
    gastronomy: [/\b(?:paella|arros|socarrat|bunyols?|orxata|fartons?|xurros?|dolcos?|postres?|rebosteria|moniato)\b/],
    attire: [/\b(?:indumentaria|vestit|vestimenta|fallera|faller|pinta|manteleta|adrec|barretina|faixa|cosset)\b/],
  },
  en: {
    conversation: [/\b(?:hello|greetings|help|information|assistant|bot)\b/],
    personality: [/\b(?:masclet|favorite\s+color|favorite\s+firecracker|smell|gunpowder)\b/],
    events: [/\b(?:mascleta|masclet|crema|offering|virgin|crida|planta|ninot|procession(?:s)?|fallera\s+mayor|monument(?:s)?|fallas?|fireworks|exhibition)\b/],
    history: [/\b(?:origin|history|parot|carpenters|tradition|founded|suspended|cancelled)\b/],
    organization: [/\b(?:jcf|central\s+board|commission|president|organization|gala|regulations)\b/],
    logistics: [/\b(?:parking|transport|clothing|quiet\s+areas?|asphalt|sand|tents?|accessibility|mobility)\b/],
    gastronomy: [/\b(?:paella|rice|socarrat|fritter(?:s)?|horchata|fartons?|churros?|sweets?|desserts?|pastries|food)\b/],
    attire: [/\b(?:attire|dress|clothing|fallera|fallero|comb|mantilla|adornment|barretina|sash|bodice)\b/],
  },
  fr: {
    conversation: [/\b(?:bonjour|salut|aide|information|assistant|bot)\b/],
    personality: [/\b(?:masclet|couleur\s+preferee|petard\s+prefere|odeur|poudre)\b/],
    events: [/\b(?:mascleta|masclet|crema|offrande|vierge|crida|planta|ninot|procession(?:s)?|fallera\s+mayor|monument(?:s)?|fallas?|feux|exposition)\b/],
    history: [/\b(?:origine|histoire|parot|charpentiers|tradition|fondation|suspendu|annule)\b/],
    organization: [/\b(?:jcf|junte\s+centrale|commission|president|organisation|gala|reglements)\b/],
    logistics: [/\b(?:parking|stationner|transport|vetements?|zones?\s+tranquill|asphalte|sable|chapiteaux?|accessibilite|mobilite)\b/],
    gastronomy: [/\b(?:paella|riz|socarrat|beignet(?:s)?|horchata|farton(?:s)?|churros?|douceurs?|desserts?|patisserie|gastronomie)\b/],
    attire: [/\b(?:tenue|robe|vetement|fallera|fallero|peigne|mantille|ornement|barretina|ceinture|corsage)\b/],
  },
};
const CASCADE_SEARCH_CLEANUP_PATTERNS = {
  es: [
    [/^(?:dime|cuentame|hablame)\s+(?:de|sobre)\s+/g, ''],
    [/^(?:quiero\s+saber|quiero)\s+(?:de|sobre)?\s*/g, ''],
    [/^(?:informacion|info)\s+(?:de|sobre)\s+/g, ''],
    [/^(?:qu[eé]\s+(?:es|son|significa))\s+(?:un[oa]?\s+|el\s+|la\s+|los\s+|las\s+)?/g, ''],
    [/^(?:cu[aá]ndo\s+(?:es|son|empieza|se\s+celebra))\s+(?:el\s+|la\s+|los\s+|las\s+)?/g, ''],
    [/^(?:cu[aá]l\s+es|cu[aá]les\s+son)\s+(?:el\s+|la\s+|los\s+|las\s+)?/g, ''],
    [/^(?:c[oó]mo\s+(?:es|son|se\s+(?:hace|llama|prepara)))\s+(?:un[oa]?\s+|el\s+|la\s+|los\s+|las\s+)?/g, ''],
    [/^(?:d[oó]nde\s+(?:es|est[aá]|hay|puedo))\s+/g, ''],
  ],
  va: [
    [/^(?:digues(?:\s+me)?|conta\s+me|parla\s+me)\s+(?:de|sobre)\s+/g, ''],
    [/^(?:vull\s+saber|vull)\s+(?:de|sobre)?\s*/g, ''],
    [/^(?:informacio)\s+(?:de|sobre)\s+/g, ''],
    [/^(?:qu[eè]\s+(?:[eé]s|s[oó]n|significa))\s+(?:un[a]?\s+|el\s+|la\s+|els\s+|les\s+)?/g, ''],
    [/^(?:quan\s+(?:[eé]s|s[oó]n|comen[cç]a|se\s+celebra))\s+(?:el\s+|la\s+|els\s+|les\s+)?/g, ''],
    [/^(?:quin[a]?\s+[eé]s|quins?\s+s[oó]n)\s+(?:el\s+|la\s+|els\s+|les\s+)?/g, ''],
    [/^(?:com\s+(?:[eé]s|s[oó]n|es\s+(?:fa|diu|prepara)))\s+(?:un[a]?\s+|el\s+|la\s+|els\s+|les\s+)?/g, ''],
    [/^(?:on\s+(?:[eé]s|est[aà]|hi\s+ha|puc))\s+/g, ''],
  ],
  en: [
    [/^(?:tell\s+me|explain)\s+(?:about\s+)?/g, ''],
    [/^(?:i\s+want\s+to\s+know|i\s+want)\s+(?:about\s+)?/g, ''],
    [/^(?:information|info)\s+(?:about\s+)?/g, ''],
    [/^(?:what\s+(?:is|are|does))\s+(?:a\s+|an\s+|the\s+)?/g, ''],
    [/^(?:when\s+(?:is|are|does))\s+(?:the\s+)?/g, ''],
    [/^(?:where\s+(?:is|are|can\s+i))\s+/g, ''],
    [/^(?:how\s+(?:is|are|do\s+(?:you|they)))\s+(?:a\s+|an\s+|the\s+)?/g, ''],
    [/^(?:which\s+(?:is|are))\s+(?:the\s+)?/g, ''],
  ],
  fr: [
    [/^(?:dis(?:\s+moi)?|explique(?:\s+moi)?)\s+(?:de|sur)\s+/g, ''],
    [/^(?:je\s+veux\s+savoir|je\s+veux)\s+(?:de|sur)?\s*/g, ''],
    [/^(?:information|infos?)\s+(?:sur\s+)?/g, ''],
    [/^(?:qu['\u2019]?est[\s-]ce\s+que?\s+(?:c['\u2019]?est|sont?))\s+(?:un[e]?\s+|le\s+|la\s+|les\s+|l['\u2019])?/g, ''],
    [/^(?:quand\s+(?:est|sont|commence))\s+(?:le\s+|la\s+|les\s+|l['\u2019])?/g, ''],
    [/^(?:o[uù]\s+(?:est|sont|se\s+trouve|puis[\s-]je))\s+/g, ''],
    [/^(?:comment\s+(?:est|sont|se\s+(?:fait|prepare)))\s+(?:un[e]?\s+|le\s+|la\s+|les\s+|l['\u2019])?/g, ''],
    [/^(?:quel(?:le)?s?\s+(?:est|sont))\s+(?:le\s+|la\s+|les\s+|l['\u2019])?/g, ''],
  ],
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

function normalizeMediaValue(...candidates) {
  const normalizedValues = [];

  candidates.forEach((candidate) => {
    const candidateList = Array.isArray(candidate) ? candidate : [candidate];

    candidateList.forEach((entry) => {
      if (typeof entry !== 'string') return;

      const normalizedEntry = entry.trim();
      if (!normalizedEntry || normalizedValues.includes(normalizedEntry)) return;

      normalizedValues.push(normalizedEntry);
    });
  });

  if (!normalizedValues.length) return null;
  return normalizedValues.length === 1 ? normalizedValues[0] : normalizedValues;
}

function normalizeCascadeText(value) {
  return removeDiacritics(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCascadePatterns(source, language = currentLanguage) {
  return source[resolveLanguageKey(language)] || source[DEFAULT_LANGUAGE] || {};
}

function matchesCascadeFamily(query, family, language = currentLanguage) {
  const normalizedQuery = normalizeCascadeText(query);
  if (!normalizedQuery) return false;

  const familyPatterns = getCascadePatterns(CASCADE_QUERY_PATTERNS, language)[family] || [];
  return familyPatterns.some((pattern) => pattern.test(normalizedQuery));
}

function detectCascadeFamilies(query, language = currentLanguage) {
  return CASCADE_FAMILY_ORDER.filter((family) => matchesCascadeFamily(query, family, language));
}

function inferResponseFamilies(item, language = currentLanguage) {
  const normalizedLanguage = resolveLanguageKey(language);
  const normalizedPath = normalizeCascadeText(item.kbPath || '');
  const combinedText = normalizeCascadeText([
    triggerToString(item.trigger),
    item.answer || item.text || '',
    normalizeKeywords(item).join(' '),
    normalizeFollowUp(item).join(' '),
    item.kbPath || '',
  ].join(' '));
  const responsePatterns = getCascadePatterns(CASCADE_RESPONSE_PATTERNS, normalizedLanguage);

  return CASCADE_FAMILY_ORDER.filter((family) => {
    const pathPatterns = CASCADE_PATH_PATTERNS[family] || [];
    const familyPatterns = responsePatterns[family] || [];

    return pathPatterns.some((pattern) => pattern.test(normalizedPath))
      || familyPatterns.some((pattern) => pattern.test(combinedText));
  });
}

function buildCascadeSearchQueries(query, language = currentLanguage) {
  const normalizedLanguage = resolveLanguageKey(language);
  const cleanupPatterns = CASCADE_SEARCH_CLEANUP_PATTERNS[normalizedLanguage] || [];
  const variants = [sanitizeUserQuery(query)];
  let cleanedQuery = normalizeCascadeText(query);

  cleanupPatterns.forEach(([pattern, replacement]) => {
    cleanedQuery = cleanedQuery.replace(pattern, replacement).trim();
  });

  if (cleanedQuery) {
    variants.push(cleanedQuery);
  }

  return mergeUniqueStrings(variants);
}

function filterItemsByCascadeFamily(items, family) {
  return items.filter((item) => Array.isArray(item.families) && item.families.includes(family));
}

function buildLanguageResponseState(langData, language = DEFAULT_LANGUAGE) {
  const safeLangData = langData && typeof langData === 'object' ? langData : {};
  const resolvedLanguage = resolveLanguageKey(language);
  const responsesFlat = flattenKnowledgeBase(safeLangData).map((item) => ({
    ...item,
    language: resolvedLanguage,
    families: inferResponseFamilies(item, resolvedLanguage),
  }));
  const responses = responsesFlat
    .map((item) => {
      const triggers = buildRegexTriggers(item.trigger);
      if (!triggers.length) return null;

      const normalizedFollowUps = normalizeFollowUp(item);

      return {
        trigger: triggers.length === 1 ? triggers[0] : triggers,
        text: item.answer || item.text,
        imagen: normalizeMediaValue(item.image, item.imagen, item.images),
        video: normalizeMediaValue(item.video, item.videos),
        followUp: normalizedFollowUps,
        kbPath: item.kbPath || '',
        families: item.families || [],
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
    .map((token) => escapeRegExp(removeDiacritics(token)));

  return new RegExp(`^\\s*[¿¡]?\\s*${tokens.join('\\s+')}\\s*[?¿!¡.]*\\s*$`, 'i');
}

function normalizeTemporalQuestion(query, language = currentLanguage) {
  const resolvedLanguage = resolveLanguageKey(language);
  let normalizedQuery = removeDiacritics(sanitizeUserQuery(query))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizationRules = TEMPORAL_NORMALIZATION_RULES[resolvedLanguage] || TEMPORAL_NORMALIZATION_RULES[DEFAULT_LANGUAGE] || [];
  normalizationRules.forEach(([pattern, replacement]) => {
    normalizedQuery = normalizedQuery.replace(pattern, replacement);
  });

  return normalizedQuery.replace(/\s+/g, ' ').trim();
}

function matchesTemporalIntent(normalizedQuery, patterns = []) {
  return patterns.some((pattern) => pattern.test(normalizedQuery));
}

function buildTemporalResponsePayload(text) {
  return {
    text,
    followUp: [],
    imagen: null,
    video: null,
  };
}

function getTemporalAnswer(query, language = currentLanguage) {
  const resolvedLanguage = resolveLanguageKey(language);
  const normalizedQuery = normalizeTemporalQuestion(query, resolvedLanguage);
  if (!normalizedQuery) return null;

  const now = new Date();
  const { dayNames: days, dateLocale } = getLanguageConfig(resolvedLanguage);
  const dayName = days[now.getDay()];
  const dayNumber = now.getDate();
  const monthName = now.toLocaleString(dateLocale || DATE_LOCALE, { month: 'long' });
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const temporalPatterns = TEMPORAL_INTENT_PATTERNS[resolvedLanguage] || TEMPORAL_INTENT_PATTERNS[DEFAULT_LANGUAGE];
  const temporalResponses = TEMPORAL_RESPONSE_BUILDERS[resolvedLanguage] || TEMPORAL_RESPONSE_BUILDERS[DEFAULT_LANGUAGE];
  const responseParts = {
    dayName,
    dayNumber,
    monthName,
    year,
    hours,
    minutes,
  };

  if (matchesTemporalIntent(normalizedQuery, temporalPatterns.date)) {
    return buildTemporalResponsePayload(temporalResponses.date(responseParts));
  }

  if (matchesTemporalIntent(normalizedQuery, temporalPatterns.year)) {
    return buildTemporalResponsePayload(temporalResponses.year(responseParts));
  }

  if (matchesTemporalIntent(normalizedQuery, temporalPatterns.time)) {
    return buildTemporalResponsePayload(temporalResponses.time(responseParts));
  }

  if (matchesTemporalIntent(normalizedQuery, temporalPatterns.day)) {
    return buildTemporalResponsePayload(temporalResponses.day(responseParts));
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

function buildModernImageSources(imagePath) {
  if (typeof imagePath !== 'string') return null;

  const normalizedPath = imagePath.trim();
  const extensionPattern = /\.(png|jpe?g)(?=($|[?#]))/i;

  if (!normalizedPath || !extensionPattern.test(normalizedPath)) {
    return null;
  }

  return {
    fallbackSrc: normalizedPath,
    webpSrc: normalizedPath.replace(extensionPattern, '.webp'),
    avifSrc: normalizedPath.replace(extensionPattern, '.avif'),
  };
}

function createResponsiveImageElement(imagePath, {
  alt = '',
  imgClassName = '',
  pictureClassName = '',
  loading = 'lazy',
  decoding = 'async',
} = {}) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function' || typeof imagePath !== 'string') {
    return null;
  }

  const modernSources = buildModernImageSources(imagePath);
  const fallbackSrc = modernSources?.fallbackSrc || imagePath.trim();

  if (!fallbackSrc) return null;

  const imgEl = document.createElement('img');
  imgEl.src = fallbackSrc;
  imgEl.alt = alt;
  if (imgClassName) imgEl.className = imgClassName;
  if (loading) imgEl.loading = loading;
  if (decoding) imgEl.decoding = decoding;

  if (!modernSources) {
    return imgEl;
  }

  const pictureEl = document.createElement('picture');
  if (pictureClassName) pictureEl.className = pictureClassName;

  const avifSourceEl = document.createElement('source');
  avifSourceEl.srcset = modernSources.avifSrc;
  avifSourceEl.type = 'image/avif';
  pictureEl.appendChild(avifSourceEl);

  const webpSourceEl = document.createElement('source');
  webpSourceEl.srcset = modernSources.webpSrc;
  webpSourceEl.type = 'image/webp';
  pictureEl.appendChild(webpSourceEl);

  pictureEl.appendChild(imgEl);
  return pictureEl;
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
  const normalizedQuery = removeDiacritics(safeQuery);
  return responseList.find((response) =>
    hasTriggerMatch(response.trigger, safeQuery)
    || hasTriggerMatch(response.trigger, normalizedQuery)
  ) || null;
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
function flattenKnowledgeBase(obj, path = []) {
  let items = [];
  
  if (Array.isArray(obj)) {
    obj.forEach(val => {
      if (val && typeof val === 'object') {
        if (val.trigger && (val.answer || val.text)) {
          items.push({
            ...val,
            kbPath: path.join('.'),
          });
        } else {
          items = items.concat(flattenKnowledgeBase(val, path));
        }
      }
    });
  } else if (obj && typeof obj === 'object') {
    for (const key in obj) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        const nextPath = path.concat(key);
        if (val.trigger && (val.answer || val.text)) {
          items.push({
            ...val,
            kbPath: nextPath.join('.'),
          });
        } else {
          items = items.concat(flattenKnowledgeBase(val, nextPath));
        }
      }
    }
  }
  return items;
}

function buildFuseDataset(data) {
  if (!Array.isArray(data)) return [];

  return data.map((item, index) => {
    const resolvedLanguage = resolveLanguageKey(item.language || currentLanguage);
    const textRaw = item.answer || item.text || '';
    const textForFuse = Array.isArray(textRaw) ? textRaw.join(' ') : String(textRaw);
    const followUp = normalizeFollowUp(item);
    const keywords = normalizeKeywords(item);
    const families = Array.isArray(item.families) ? item.families : inferResponseFamilies(item, resolvedLanguage);
    const followUpStr = followUp.join(' ');
    const keywordsStr = keywords.join(' ');
    const triggerStr = triggerToString(item.trigger);
    const idSource = `${triggerStr}|${cleanText(textForFuse, resolvedLanguage)}`;

    return {
      ...item,
      entryId: `${index}:${idSource}`,
      text: textRaw,
      imagen: normalizeMediaValue(item.image, item.imagen, item.images),
      video: normalizeMediaValue(item.video, item.videos),
      followUp,
      keywords,
      kbPath: item.kbPath || '',
      language: resolvedLanguage,
      families,
      normalized: cleanText(textForFuse, resolvedLanguage),
      followUpStr: cleanText(followUpStr, resolvedLanguage),
      keywordsStr: cleanText(keywordsStr, resolvedLanguage),
      triggerStr: cleanText(triggerStr, resolvedLanguage),
      combo: cleanText(`${textForFuse} ${followUpStr} ${triggerStr}`, resolvedLanguage),
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

const SYNONYM_TABLE = {
  es: {
    pirotecnia: ['mascletà', 'mascleta', 'petardos', 'fuegos artificiales'],
    mascleta: ['pirotecnia', 'mascletà'],
    mascletà: ['pirotecnia', 'mascleta'],
    comida: ['paella', 'gastronomia', 'cocina'],
    paella: ['arroz', 'comida valenciana'],
    vestido: ['traje', 'indumentaria', 'vestimenta'],
    traje: ['vestido', 'indumentaria', 'vestimenta'],
    indumentaria: ['traje', 'vestido', 'vestimenta'],
    monumento: ['falla', 'ninot', 'escultura'],
    falla: ['monumento', 'ninot'],
    flores: ['ofrenda', 'clavel'],
    ofrenda: ['flores', 'virgen', 'clavel'],
    arroz: ['paella', 'comida'],
    fuego: ['crema', 'cremà', 'quemar'],
    fiesta: ['fallas', 'celebracion'],
    dulces: ['buñuelos', 'pasteles', 'reposteria'],
    musica: ['banda', 'pasodoble', 'pasacalles'],
    joyeria: ['aderezo', 'peineta', 'orfebreria'],
    peinado: ['rodetes', 'moños', 'posticeria'],
  },
  va: {
    pirotecnia: ['mascletà', 'mascleta', 'petards'],
    mascleta: ['pirotecnia', 'mascletà'],
    menjar: ['paella', 'gastronomia', 'cuina'],
    paella: ['arros', 'menjar valencia'],
    vestit: ['indumentaria', 'vestimenta'],
    monument: ['falla', 'ninot'],
    flors: ['ofrena', 'clavell'],
    ofrena: ['flors', 'verge'],
    foc: ['crema', 'cremar'],
    dolcos: ['bunyols', 'pastissos'],
  },
  en: {
    pyrotechnics: ['mascleta', 'firecrackers', 'fireworks'],
    food: ['paella', 'gastronomy', 'cuisine'],
    paella: ['rice', 'valencian food'],
    dress: ['attire', 'costume', 'clothing'],
    monument: ['falla', 'ninot', 'sculpture'],
    flowers: ['offering', 'carnation'],
    offering: ['flowers', 'virgin'],
    fire: ['crema', 'burning'],
    sweets: ['fritters', 'pastries'],
    music: ['band', 'parade'],
    jewelry: ['adornment', 'comb', 'goldsmith'],
  },
  fr: {
    pyrotechnie: ['mascleta', 'petards', 'feux'],
    nourriture: ['paella', 'gastronomie', 'cuisine'],
    paella: ['riz', 'nourriture valencienne'],
    tenue: ['costume', 'vetement'],
    monument: ['falla', 'ninot', 'sculpture'],
    fleurs: ['offrande', 'oeillet'],
    offrande: ['fleurs', 'vierge'],
    feu: ['crema', 'bruler'],
    douceurs: ['beignets', 'patisserie'],
  },
};

function expandSynonyms(query, language = 'es') {
  const table = SYNONYM_TABLE[language] || SYNONYM_TABLE.es;
  const normalizedQuery = removeDiacritics(query).toLowerCase();
  const words = normalizedQuery.split(/\s+/);
  const expansions = [];

  words.forEach((word) => {
    const synonyms = table[word];
    if (synonyms) {
      expansions.push(...synonyms);
    }
  });

  if (!expansions.length) return null;
  return `${normalizedQuery} ${expansions.join(' ')}`;
}

function buildFuseQueries(query) {
  const safeQuery = sanitizeUserQuery(query);
  const normalizedQuery = cleanText(safeQuery);
  const semanticQuery = cleanText(analizarConsultaCompromise(safeQuery));
  const synonymQuery = expandSynonyms(normalizedQuery, currentLanguage);

  return [normalizedQuery, semanticQuery, synonymQuery]
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function buscarConFuse(query) {
  if (!fuse || !query) return [];

  const queries = buildFuseQueries(query);
  const allResults = queries.flatMap((term) => fuse.search(term, { limit: FUSE_LIMIT }));
  return dedupeFuseResults(allResults);
}

function searchFuseInDataset(query, data = respuestasPlanas) {
  if (!query || !Array.isArray(data) || !data.length || !FuseCtor) return [];

  if (data === respuestasPlanas) {
    return buscarConFuse(query);
  }

  const dataset = data[0]?.entryId && data[0]?.combo
    ? data
    : buildFuseDataset(data);
  const localFuse = new FuseCtor(dataset, FUSE_OPTIONS);
  const queries = buildFuseQueries(query);
  const allResults = queries.flatMap((term) => localFuse.search(term, { limit: FUSE_LIMIT }));
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

// ---- Memoria de tema (Fase 8) ----
let lastTopicContext = null;

const ANAPHORIC_PATTERNS = {
  es: [
    /^(?:dime\s+m[aá]s|cu[eé]ntame\s+m[aá]s|m[aá]s\s+sobre\s+eso|ampl[ií]a|quiero\s+saber\s+m[aá]s|m[aá]s\s+informaci[oó]n|y\s+(?:qu[eé]|c[oó]mo)\s+m[aá]s|sigue|contin[uú]a|algo\s+m[aá]s)\s*[?¿!¡.]*\s*$/i,
    /^(?:m[aá]s)\s*[?¿!¡.]*\s*$/i,
  ],
  va: [
    /^(?:digues\s+m[eé]s|conta\s+m[eé]s|m[eé]s\s+sobre\s+aix[oò]|amplia|vull\s+saber\s+m[eé]s|m[eé]s\s+informaci[oó]|segueix|continua)\s*[?¿!¡.]*\s*$/i,
    /^(?:m[eé]s)\s*[?¿!¡.]*\s*$/i,
  ],
  en: [
    /^(?:tell\s+me\s+more|more\s+about\s+(?:that|this|it)|expand|i\s+want\s+(?:to\s+know\s+)?more|more\s+info(?:rmation)?|go\s+on|continue|anything\s+else)\s*[?!.]*\s*$/i,
    /^(?:more)\s*[?!.]*\s*$/i,
  ],
  fr: [
    /^(?:dis[\s-](?:m(?:'|'))?en\s+plus|plus\s+sur\s+[cç]a|d[eé]veloppe|je\s+veux\s+(?:en\s+)?savoir\s+plus|plus\s+d['\u2019]infos?|continue)\s*[?!.]*\s*$/i,
    /^(?:plus)\s*[?!.]*\s*$/i,
  ],
};

function isAnaphoricQuery(query, language = currentLanguage) {
  const patterns = ANAPHORIC_PATTERNS[language] || ANAPHORIC_PATTERNS.es;
  const safeQuery = sanitizeUserQuery(query);
  return patterns.some((p) => p.test(safeQuery));
}

function updateTopicContext(family, item, query) {
  lastTopicContext = {
    family: family || (item.families && item.families[0]) || null,
    item,
    query,
    timestamp: Date.now(),
  };
}

function clearTopicContext() {
  lastTopicContext = null;
}

function clearObjectValues(target) {
  Object.keys(target).forEach((key) => delete target[key]);
}

function resetConversationState({ announcement = null, focusInput = true } = {}) {
  clearObjectValues(lastResponses);
  clearObjectValues(repeatCount);
  clearObjectValues(conversationHistory);
  clearTopicContext();

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

const CONTEXTUAL_FALLBACK_SUGGESTIONS = {
  es: {
    events: ['Mascletà', 'Cremà', 'Ofrenda', 'Nit del Foc', 'Despertà'],
    gastronomy: ['Paella', 'Buñuelos', 'Horchata', 'Esmorçar', 'Cremaet'],
    attire: ['Traje de fallera', 'Traje de fallero', 'Peineta', 'Espolines', 'Aderezo'],
    history: ['Origen de las Fallas', 'El parot', 'Fundación JCF', 'Suspensiones'],
    organization: ['Junta Central Fallera', 'Comisiones', 'Interagrupación'],
    logistics: ['Aparcar en Fallas', 'Zonas tranquilas', 'Accesibilidad PMR'],
    personality: ['¿Cómo te llamas?', '¿Qué color te gusta?', '¿Te gusta la pólvora?'],
    conversation: ['¿Sobre qué tema quieres hablar?'],
  },
  va: {
    events: ['Mascletà', 'Cremà', 'Ofrena', 'Nit del Foc', 'Despertà'],
    gastronomy: ['Paella', 'Bunyols', 'Orxata', 'Esmorzar', 'Cremaet'],
    attire: ['Vestit de fallera', 'Vestit de faller', 'Pinta', 'Espolines', 'Adrec'],
    history: ['Origen de les Falles', 'El parot', 'Fundació JCF'],
    organization: ['Junta Central Fallera', 'Comissions', 'Interagrupació'],
    logistics: ['Aparcar en Falles', 'Zones tranquil·les', 'Accessibilitat PMR'],
  },
  en: {
    events: ['Mascletà', 'Cremà', 'Offering', 'Nit del Foc', 'Despertà'],
    gastronomy: ['Paella', 'Fritters', 'Horchata', 'Valencian breakfast'],
    attire: ['Fallera dress', 'Fallero suit', 'Comb', 'Silk fabrics'],
    history: ['Origin of Fallas', 'The parot', 'JCF foundation'],
    organization: ['Central Board', 'Commissions', 'Inter-grouping'],
    logistics: ['Parking during Fallas', 'Quiet zones', 'Accessibility'],
  },
  fr: {
    events: ['Mascletà', 'Cremà', 'Offrande', 'Nit del Foc', 'Despertà'],
    gastronomy: ['Paella', 'Beignets', 'Horchata', 'Petit-déjeuner valencien'],
    attire: ['Tenue de fallera', 'Tenue de fallero', 'Peigne', 'Soieries'],
    history: ['Origine des Fallas', 'Le parot', 'Fondation JCF'],
    organization: ['Junte Centrale', 'Commissions', 'Inter-groupement'],
    logistics: ['Stationner pendant les Fallas', 'Zones tranquilles', 'Accessibilité'],
  },
};

function buildSemanticFallbackSuggestions(query) {
  const normalizedQuery = normalizeTemporalQuestion(query);
  if (!normalizedQuery) return [];

  // Fase 9: priorizar sugerencias de la familia activa si hay contexto
  if (lastTopicContext && lastTopicContext.family) {
    const langSuggestions = CONTEXTUAL_FALLBACK_SUGGESTIONS[currentLanguage] || CONTEXTUAL_FALLBACK_SUGGESTIONS.es;
    const contextualSuggestions = langSuggestions[lastTopicContext.family];
    if (contextualSuggestions && contextualSuggestions.length) {
      return contextualSuggestions;
    }
  }

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

function resolveCascadeStrategy(
  query,
  directResponses = respuestas,
  flatResponses = respuestasPlanas,
  language = currentLanguage,
  fallbackSuggestions = getFallbackSuggestionPool(),
  runtimeConfig = getFuseRuntimeConfig()
) {
  const matchedFamilies = detectCascadeFamilies(query, language);
  if (!matchedFamilies.length) return null;

  for (const family of matchedFamilies) {
    const familyResponses = filterItemsByCascadeFamily(directResponses, family);
    if (familyResponses.length) {
      const scopedQueries = buildCascadeSearchQueries(query, language);
      for (const candidateQuery of scopedQueries) {
        const directMatch = findDirectResponse(candidateQuery, familyResponses);
        if (directMatch) {
          return {
            mode: 'direct',
            item: directMatch,
            family,
            cascade: true,
          };
        }
      }
    }

    const familyFlatResponses = filterItemsByCascadeFamily(flatResponses, family);
    if (!familyFlatResponses.length) continue;

    const scopedQuery = buildCascadeSearchQueries(query, language).slice(-1)[0] || query;
    const familyFuseResults = searchFuseInDataset(scopedQuery, familyFlatResponses);
    const familyStrategy = evaluateFuseStrategy(query, familyFuseResults, fallbackSuggestions, runtimeConfig);
    if (familyStrategy.mode === 'answer' || familyStrategy.mode === 'guided-fallback') {
      return {
        ...familyStrategy,
        family,
        cascade: true,
        fuseResults: familyFuseResults,
      };
    }
  }

  return null;
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

const PERSONALITY_COLETILLAS = {
  es: [
    'Ché, ¡qué maravilla!',
    '¡Eso es Valencia pura!',
    'A mí la pólvora me pierde, ¿se nota?',
    '¡Viva la festa!',
    '¡Eso sí que es tradición!',
    'Me emociono solo de contarlo.',
    '¡Qué bonito es ser fallero!',
  ],
  va: [
    'Xe, quina meravella!',
    'Això és València pura!',
    'A mi la pólvora em perd, es nota?',
    'Visca la festa!',
    'Això sí que és tradició!',
    "M'emocione només de contar-ho.",
    'Que bonic és ser faller!',
  ],
  en: [
    'How wonderful!',
    "That's pure Valencia!",
    'I do love gunpowder, can you tell?',
    'Long live the festival!',
    "Now that's what I call tradition!",
    'I get emotional just talking about it.',
    "There's nothing like being a fallero!",
  ],
  fr: [
    'Quelle merveille !',
    "C'est la pure Valence !",
    "J'adore la poudre, ça se voit ?",
    'Vive la fête !',
    "Ça, c'est de la vraie tradition !",
    "Je m'émeus rien qu'en le racontant.",
    "Qu'il est beau d'être fallero !",
  ],
};
const PASSIONATE_FAMILIES = ['events', 'gastronomy', 'attire'];
const COLETILLA_PROBABILITY = 0.25;

function maybeAddColetilla(text, item, language = currentLanguage) {
  const families = item.families || [];
  const isPassionate = families.some((f) => PASSIONATE_FAMILIES.includes(f));
  if (!isPassionate) return text;
  if (Math.random() > COLETILLA_PROBABILITY) return text;

  const pool = PERSONALITY_COLETILLAS[language] || PERSONALITY_COLETILLAS.es;
  const coletilla = pool[Math.floor(Math.random() * pool.length)];
  return `${text} ${coletilla}`;
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

  responseText = maybeAddColetilla(responseText, item);

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
  const temporalAnswer = getTemporalAnswer(safeQuery, currentLanguage);
  if (temporalAnswer) return temporalAnswer;

  // Fase 8: detectar referencias anafóricas
  if (isAnaphoricQuery(safeQuery, currentLanguage) && lastTopicContext) {
    const config = getLanguageConfig(currentLanguage);
    const anaphoricText = config.ui.anaphoricResponseText || '¡Aquí tienes más sobre ese tema!';
    const followUps = lastTopicContext.item.followUp || [];
    return {
      text: anaphoricText,
      followUp: followUps,
      imagen: null,
      video: null,
    };
  }

  const queryKey = safeQuery.toLowerCase();
  repeatCount[queryKey] = (repeatCount[queryKey] || 0) + 1;

  const fallbackSuggestions = getFallbackSuggestionPool();
  const runtimeConfig = getFuseRuntimeConfig();
  const cascadeStrategy = resolveCascadeStrategy(
    safeQuery,
    respuestas,
    respuestasPlanas,
    currentLanguage,
    fallbackSuggestions,
    runtimeConfig
  );

  if (cascadeStrategy) {
    if (cascadeStrategy.mode === 'direct' || cascadeStrategy.mode === 'answer') {
      updateTopicContext(cascadeStrategy.family, cascadeStrategy.item, safeQuery);
      return buildResponsePayload(cascadeStrategy.item, queryKey);
    }

    return cascadeStrategy.response;
  }

  const fuseResults = buscarConFuse(safeQuery);
  const strategy = resolveResponseStrategy(safeQuery, respuestas, fuseResults, fallbackSuggestions, runtimeConfig);

  recordFuseDebugEntry(safeQuery, fuseResults, strategy, runtimeConfig);

  if (strategy.mode === 'direct' || strategy.mode === 'answer') {
    updateTopicContext(strategy.family, strategy.item, safeQuery);
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
          const mediaEl = createResponsiveImageElement(url, {
            alt: 'Imagen de respuesta',
            imgClassName: 'message__image',
            pictureClassName: 'message__picture',
          });

          if (mediaEl) {
            messagesEl.appendChild(mediaEl);
          }
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
    detectCascadeFamilies,
    inferResponseFamilies,
    searchFuseInDataset,
    resolveCascadeStrategy,
    buildModernImageSources,
    createResponsiveImageElement,
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
    expandSynonyms,
    isAnaphoricQuery,
    updateTopicContext,
    clearTopicContext,
    maybeAddColetilla,
    STOP_WORDS_BY_LANGUAGE,
    PERSONALITY_COLETILLAS,
    CONTEXTUAL_FALLBACK_SUGGESTIONS,
    SYNONYM_TABLE,
    ANAPHORIC_PATTERNS,
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
