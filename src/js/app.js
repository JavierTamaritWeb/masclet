// ============================================================
// APP.JS – Masclet Bot Fallero
// Chatbot interactivo con NLP, Fuse.js y Compromise
// ============================================================

// ---- Análisis semántico con Compromise ----
function analizarConsultaCompromise(q) {
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
const chatEl = document.querySelector('.chatbot');
const headerEl = document.querySelector('.chatbot__header');
const toggleBtn = document.querySelector('.chatbot__toggle');
const messagesEl = document.querySelector('.chatbot__body');
const suggestionsEl = document.querySelector('.suggestions');
const inputEl = document.querySelector('.input-area__field');
const sendBtn = document.querySelector('.input-area__send');
const resetBtn = document.querySelector('.input-area__reset');
const wrapper = document.querySelector('.chat-wrapper');

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
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanText(text) {
  let cleaned = removeDiacritics(text).toLowerCase();
  cleaned = cleaned.replace(stopWords, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

// ---- Drag & Drop para mover el chat ----
let dragging = false;
let dx = 0;
let dy = 0;

headerEl.addEventListener('mousedown', (e) => {
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
  const wrapperRect = wrapper.getBoundingClientRect();
  let newLeft = e.clientX - dx - wrapperRect.left;
  let newTop = e.clientY - dy - wrapperRect.top;
  const chatWidth = chatEl.offsetWidth;
  const chatHeight = chatEl.offsetHeight;

  if (newLeft < 0) newLeft = 0;
  if (newLeft + chatWidth > wrapperRect.width) newLeft = wrapperRect.width - chatWidth;
  if (newTop < 0) newTop = 0;
  if (newTop + chatHeight > wrapperRect.height) newTop = wrapperRect.height - chatHeight;

  chatEl.style.left = newLeft + 'px';
  chatEl.style.top = newTop + 'px';
});

document.addEventListener('mouseup', () => {
  dragging = false;
  document.body.style.userSelect = '';
});

// ---- Minimizar / Expandir el chat ----
toggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isMin = chatEl.classList.toggle('chatbot--minimized');
  toggleBtn.textContent = isMin ? '+' : '_';
  toggleBtn.setAttribute('aria-expanded', String(!isMin));
});

// ---- Ajuste automático según tamaño de pantalla ----
function checkScreenSize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const minMargin = width <= 768 ? 10 : width <= 1024 ? 20 : 40;
  const chatWidth = chatEl.offsetWidth;
  const chatHeight = chatEl.offsetHeight;

  let currentLeft = parseInt(chatEl.style.left, 10) || (width - chatWidth - minMargin);
  let currentTop = parseInt(chatEl.style.top, 10) || (height - chatHeight - minMargin);

  if (currentLeft < minMargin) currentLeft = minMargin;
  if (currentLeft + chatWidth > width - minMargin) currentLeft = width - chatWidth - minMargin;
  if (currentTop < minMargin) currentTop = minMargin;
  if (currentTop + chatHeight > height - minMargin) currentTop = height - chatHeight - minMargin;

  chatEl.style.left = currentLeft + 'px';
  chatEl.style.top = currentTop + 'px';

  if (width <= 1700) {
    if (!chatEl.classList.contains('chatbot--minimized')) {
      chatEl.classList.add('chatbot--minimized');
      toggleBtn.textContent = '+';
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  } else {
    if (chatEl.classList.contains('chatbot--minimized')) {
      chatEl.classList.remove('chatbot--minimized');
      toggleBtn.textContent = '_';
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
  }
}

window.addEventListener('resize', checkScreenSize);

// ---- Variables globales para respuestas ----
let respuestas = [];
let fuse;
let respuestasPlanas = [];

// ---- Cargar respuestas desde JSON ----
async function cargarRespuestas() {
  try {
    const resp = await fetch('json/respuestas.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    respuestasPlanas = [];
    const rn = data[0].redNeuronal;

    for (const key in rn) {
      const value = rn[key];
      if (Array.isArray(value)) {
        respuestasPlanas.push(...value);
      } else if (typeof value === 'object') {
        for (const subKey in value) {
          const arr = value[subKey];
          if (Array.isArray(arr)) {
            respuestasPlanas.push(...arr);
          }
        }
      }
    }

    respuestas = respuestasPlanas.map((item) => ({
      trigger: new RegExp(item.trigger, 'i'),
      text: item.text,
      imagen: item.imagen || null,
      video: item.video || null,
      followUp: item.followUp || [],
    }));

    fuse = new Fuse(respuestasPlanas, { keys: ['text'], threshold: 0.4 });
  } catch (err) {
    console.error('Error cargando JSON:', err);
    typeMessage('¡Uy! No he podido cargar mis respuestas.');
  }
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
  thinkingEl.className = 'message message--bot';
  thinkingEl.textContent = 'Pensando...';
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

// ---- Sugerencias extendidas (fallback semántico) ----
function sugerenciasExtendidas(q) {
  const sugerencias = [
    { keywords: ['falla', 'fallas', 'monumento'], text: '¿Quizás te refieres a los monumentos falleros? Prueba a preguntar sobre la Plantà o la Cremà.' },
    { keywords: ['comida', 'comer', 'gastronomía'], text: '¿Buscas información gastronómica? Pregunta sobre buñuelos, paella o chocolate.' },
    { keywords: ['música', 'banda', 'pasacalle'], text: '¿Te interesa la música fallera? Prueba con pasacalle o despertà.' },
    { keywords: ['traje', 'vestido', 'indumentaria'], text: '¿Quieres saber sobre la indumentaria? Pregunta sobre el traje de fallera o el traje de fallero.' },
  ];
  const qLower = q.toLowerCase();
  for (const s of sugerencias) {
    if (s.keywords.some((kw) => qLower.includes(kw))) return s.text;
  }
  return null;
}

// ---- Motor de respuestas ----
async function responder(q) {
  // Validación: fecha actual
  if (/^(?:en\s+que\s+fecha\s+estamos\??)$/i.test(q)) {
    const now = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = days[now.getDay()];
    const dayNumber = now.getDate();
    const monthName = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();
    return { text: `Hoy es ${dayName}, ${dayNumber} de ${monthName} del ${year}.`, followUp: [], imagen: null, video: null };
  }

  // Validación: año actual
  if (/^(?:en\s+que\s+año\s+estamos\??)$/i.test(q)) {
    const year = new Date().getFullYear();
    return { text: `Estamos en ${year}.`, followUp: [], imagen: null, video: null };
  }

  // Validación: hora actual
  if (/^(?:qué|que)\s+hora\s+es\??$/i.test(q)) {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return { text: `La hora actual es ${hours}:${minutes}.`, followUp: [], imagen: null, video: null };
  }

  // Validación: día de la semana
  if (/^(?:qué|que)\s+dia\s+es\??$/i.test(q)) {
    const now = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = days[now.getDay()];
    const dayNumber = now.getDate();
    const monthName = now.toLocaleString('default', { month: 'long' });
    return { text: `Hoy es ${dayName}, ${dayNumber} de ${monthName}.`, followUp: [], imagen: null, video: null };
  }

  // Buscar en respuestas por trigger
  const queryKey = q.toLowerCase();
  repeatCount[queryKey] = (repeatCount[queryKey] || 0) + 1;

  for (const r of respuestas) {
    if (r.trigger.test(q)) {
      const key = r.trigger.toString();
      if (Array.isArray(r.text)) {
        let randomIndex;
        do {
          randomIndex = Math.floor(Math.random() * r.text.length);
        } while (lastResponses[key] === randomIndex);
        lastResponses[key] = randomIndex;
        let responseText = r.text[randomIndex];
        if (repeatCount[queryKey] > 3) {
          responseText += ' (Ya me lo habías preguntado, ¡pero aquí te lo repito de otra forma!)';
        }
        return { text: responseText, followUp: r.followUp || [], imagen: r.imagen || null, video: r.video || null };
      }
      return { text: r.text, followUp: r.followUp || [], imagen: r.imagen || null, video: r.video || null };
    }
  }

  // Búsqueda difusa con Fuse.js
  if (fuse) {
    const fuseResults = fuse.search(q);
    const uniqueResults = _.uniqBy(fuseResults, (r) => r.item.text);
    const sortedResults = _.orderBy(uniqueResults, ['score'], ['asc']);

    if (sortedResults.length) {
      const mejor = sortedResults[0].item;
      if (sortedResults[0].score > 0.45) {
        const msg = sugerenciasExtendidas(q);
        return { text: msg || '¿Puedes reformular la pregunta?', followUp: [], imagen: null, video: null };
      }
      if (Array.isArray(mejor.text)) {
        const key = mejor.trigger ? mejor.trigger.toString() : JSON.stringify(mejor.text);
        let randomIndex;
        do {
          randomIndex = Math.floor(Math.random() * mejor.text.length);
        } while (lastResponses[key] === randomIndex);
        lastResponses[key] = randomIndex;
        return { text: mejor.text[randomIndex], followUp: mejor.followUp || [], imagen: mejor.imagen || null, video: mejor.video || null };
      }
      return { text: mejor.text, followUp: mejor.followUp || [], imagen: mejor.imagen || null, video: mejor.video || null };
    } else {
      showSuggestions(['Plantà', 'Cremà', 'Traje fallera', 'Buñuelos']);
      return { text: 'No encontré nada exacto, pero aquí tienes sugerencias.', followUp: [], imagen: null, video: null };
    }
  }
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
    }, delay);
  } catch (err) {
    console.error(err);
    typeMessage('¡Ups! Algo falló.');
  }
}

// ---- Event listeners ----
sendBtn.addEventListener('click', () => {
  const q = inputEl.value.trim();
  if (!q) return;
  addMessage(q, 'user');
  inputEl.value = '';
  handleQuestion(q);
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

// ---- Mejoras Fuse.js: combo + pesos ----
const respuestasNormalizadas = respuestasPlanas.map((item) => ({
  ...item,
  normalized: cleanText(item.text),
  followUpStr: (item.followUp || []).join(' '),
  combo: cleanText(item.text + ' ' + (item.followUp || []).join(' ')),
}));

fuse = new Fuse(respuestasNormalizadas, {
  keys: [
    { name: 'combo', weight: 0.6 },
    { name: 'normalized', weight: 0.3 },
    { name: 'followUpStr', weight: 0.1 },
  ],
  threshold: 0.35,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

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

// ---- Resetear conversación ----
resetBtn.addEventListener('click', () => {
  messagesEl.innerHTML = '';
  suggestionsEl.innerHTML = '';
  Object.keys(conversationHistory).forEach((key) => delete conversationHistory[key]);
  typeMessage('¡Aquí estoy de nuevo! ¿Qué necesitas?', true);
  inputEl.focus();
});

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

// ---- Inicialización ----
window.onload = async () => {
  inputEl.focus();
  await cargarRespuestas();
  typeMessage('¡BOOM! 🎇 Soy Masclet. Salúdame con "hola".', true);
  checkScreenSize();
};
