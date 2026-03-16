/**
 * Injection script: 26 Q&A joyería fallera
 * - Enriches 7 existing intents (triggers, answers, keywords)
 * - Creates 2 new intents
 * Expected: 254 → 256 intents
 */
const fs = require('fs');
const path = require('path');

const KB_PATH = path.join(__dirname, 'src', 'data', 'knowledge.json');
const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));

// ── helpers ──
function flatFind(obj, testFn, trail = '') {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (testFn(item)) return { item, path: trail };
      const sub = flatFind(item, testFn, trail);
      if (sub) return sub;
    }
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const p = trail ? `${trail}.${k}` : k;
      const sub = flatFind(v, testFn, p);
      if (sub) return sub;
    }
  }
  return null;
}

function countIntents(obj) {
  let n = 0;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item.trigger) n++;
      else n += countIntents(item);
    }
  } else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) n += countIntents(v);
  }
  return n;
}

const BEFORE = countIntents(kb.es);

// ═══════════════════════════════════════════
// PHASE 1: ENRICH 7 EXISTING INTENTS
// ═══════════════════════════════════════════

// --- 1.1 aderezo (L1651) ← Q1, Q2, Q3, Q4 ---
const aderezo = flatFind(kb.es, i => (i.answer || '').includes('orfebrería cincelada que adorna'));
if (!aderezo) throw new Error('aderezo intent not found');
aderezo.item.trigger = 'regex:^\\s*[¿¡]?\\s*(?:qu[eé]\\s+es\\s+(?:el\\s+)?aderezo\\s+(?:de\\s+)?(?:la\\s+)?(?:valenciana|fallera)|aderezo\\s+(?:de\\s+)?valenciana|(?:conjunto\\s+(?:de\\s+)?)?(?:joyas?|orfebrer[ií]a)\\s+(?:de\\s+)?(?:la\\s+)?(?:valenciana|fallera)|aderezo\\s+faller[ao]?|(?:qu[eé]|c[oó]mo)\\s+(?:nombre|se\\s+llam[ae])\\s+(?:el\\s+)?conjunto\\s+(?:de\\s+)?joyas?\\s+(?:de\\s+)?(?:las\\s+)?falleras?|(?:de\\s+)?qu[eé]\\s+material\\s+(?:es|est[aá]|se\\s+(?:fabrica|hace|realiza))\\s+(?:el\\s+)?aderezo|qu[eé]\\s+t[eé]cnica\\s+(?:de\\s+)?orfebrer[ií]a\\s+(?:se\\s+)?(?:usa|utiliza|emplea)|t[eé]cnica\\s+(?:del?\\s+)?cincelado\\s+(?:joyas?|orfebrer[ií]a)|(?:cu[aá]les|qu[eé])\\s+(?:son\\s+)?(?:las\\s+)?piezas?\\s+(?:principales?\\s+)?(?:(?:que\\s+)?(?:componen|forman)\\s+)?(?:del?\\s+)?aderezo)\\s*[?¿!¡.]*\\s*$';
aderezo.item.answer = 'El aderezo es el nombre que recibe el conjunto de joyas de la indumentaria tradicional femenina. Se fabrica generalmente en latón con baño de oro o plata, trabajado artesanalmente mediante la técnica del cincelado. Sus componentes principales son la joia, los pendientes, el collar y los accesorios para el pelo (peinetas y pinchos), formando un juego completo coordinado.';
aderezo.item.keywords = [
  ...(aderezo.item.keywords || []),
  'nombre conjunto joyas',
  'material aderezo latón',
  'cincelado orfebrería',
  'piezas principales aderezo',
  'componentes aderezo fallera',
  'técnica cincelado joyas',
  'fabricación aderezo',
  'baño oro plata'
];
console.log('✅ 1.1 aderezo enriched');

// --- 1.2 joia (L1685) ← Q5, Q6 ---
const joia = flatFind(kb.es, i => (i.answer || '').includes('pieza central y más llamativa'));
if (!joia) throw new Error('joia intent not found');
joia.item.trigger = 'regex:^\\s*[¿¡]?\\s*(?:qu[eé]\\s+es\\s+(?:la\\s+)?joia(?:\\s+(?:del?\\s+)?(?:aderezo|traje|fallera))?|joia\\s+(?:del?\\s+)?aderezo|joia\\s+(?:pieza\\s+)?central|(?:pieza\\s+)?central\\s+(?:del?\\s+)?aderezo|joia\\s+(?:escote|manteleta)|(?:qu[eé]\\s+)?funci[oó]n\\s+(?:(?:cumple|tiene)\\s+)?(?:de\\s+)?(?:la\\s+)?joia|(?:para\\s+)?qu[eé]\\s+sirve\\s+(?:la\\s+)?joia|joia\\s+(?:dentro|en)\\s+(?:de\\s+)?(?:la\\s+)?orfebrer[ií]a)\\s*[?¿!¡.]*\\s*$';
joia.item.keywords = [
  ...(joia.item.keywords || []),
  'función joia',
  'para qué sirve joia',
  'joia orfebrería fallera'
];
console.log('✅ 1.2 joia enriched');

// --- 1.3 joyas XVIII vs XIX (L1668) ← Q7, Q14, Q15, Q16, Q17 ---
const joyasEpoca = flatFind(kb.es, i => (i.answer || '').includes('barroquismo con aderezos en forma de racimo'));
if (!joyasEpoca) throw new Error('joyas XVIII vs XIX intent not found');
joyasEpoca.item.trigger = 'regex:^\\s*[¿¡]?\\s*(?:(?:qu[eé]\\s+)?diferencias?\\s+(?:hay\\s+)?(?:en\\s+)?(?:las\\s+)?joyas?\\s+(?:(?:del?\\s+)?siglo\\s+)?(?:xviii|xix|18|19)(?:\\s+(?:y|o)\\s+(?:(?:del?\\s+)?siglo\\s+)?(?:xviii|xix|18|19))?|(?:qu[eé]\\s+)?diferencias?\\s+(?:hay\\s+)?(?:entre\\s+)?espejuelos?\\s+(?:y|o)\\s+perlas?|joyas?\\s+siglo\\s+(?:xviii|xix|18|19)\\s+(?:vs?|o|frente|contra)\\s+(?:siglo\\s+)?(?:xviii|xix|18|19)|espejuelos?\\s+(?:vs?|o|y|frente)\\s+perlas?|perlas?\\s+(?:en\\s+)?racimo\\s+faller[ao]?|espejuelos?\\s+(?:del?\\s+)?aderezo|collar\\s+(?:de\\s+)?perlas?\\s+(?:(?:del?\\s+)?siglo\\s+)?(?:xix|19|farolet)|(?:c[oó]mo\\s+(?:es|suele\\s+ser)\\s+)?(?:el\\s+)?collar\\s+(?:del?\\s+)?(?:estilo\\s+)?(?:siglo\\s+)?(?:xix|19|farolet)|estilo\\s+(?:de\\s+)?barroquismo\\s+(?:en\\s+)?(?:las\\s+)?joyas?|qu[eé]\\s+(?:son|es)\\s+(?:los\\s+)?espejuelos?|(?:de\\s+)?qu[eé]\\s+color(?:es)?\\s+(?:son\\s+)?(?:los\\s+)?espejuelos?|colores?\\s+(?:de\\s+)?(?:los\\s+)?espejuelos?|caracter[ií]sticas?\\s+joyas?\\s+(?:siglo\\s+)?(?:xviii|xix|18|19)|joyer[ií]a\\s+(?:del?\\s+)?(?:siglo\\s+)?(?:xviii|xix|18|19)\\s+(?:a\\s+)?l[\\x27]?antiga)\\s*[?¿!¡.]*\\s*$';
joyasEpoca.item.answer = 'El estilo del siglo XIX (de farolet) se asocia al barroquismo, destacando el collar de perlas de varias vueltas y aderezos en forma de racimo fabricados con perlas. El estilo del siglo XVIII (a l\'antiga) sustituye las perlas por espejuelos: piedras de cristal que imitan gemas preciosas, generalmente en tonos verdes, blancos o rojos.';
joyasEpoca.item.keywords = [
  ...(joyasEpoca.item.keywords || []),
  'collar perlas siglo xix',
  'qué son espejuelos',
  'colores espejuelos',
  'barroquismo joyas fallera',
  'collar varias vueltas',
  'piedras cristal imitación',
  'espejuelos verdes blancos rojos',
  'joyas a l\'antiga'
];
console.log('✅ 1.3 joyas XVIII vs XIX enriched');

// --- 1.4 pinta y rascamonyos (L834) ← Q9, Q10, Q11 ---
const pintaRasc = flatFind(kb.es, i => (i.answer || '').includes('peinetas de orfebrería cincelada en latón'));
if (!pintaRasc) throw new Error('pinta y rascamonyos intent not found');
pintaRasc.item.trigger = 'regex:^\\s*[¿¡]?\\s*(?:qu[eé]\\s+(?:son|es)\\s+(?:la\\s+)?pinta\\s+(?:y\\s+)?(?:los\\s+)?rascamonyos?|(?:la\\s+)?pinta\\s+(?:y\\s+)?(?:los\\s+)?rascamonyos?|peinetas?\\s+(?:de\\s+)?orfebre[ií]a\\s+(?:de\\s+)?(?:las\\s+)?falleras?|rascamonyos?|cu[aá]ntas\\s+peinetas?\\s+(?:tiene|lleva|forman?|son|necesita|completan?)(?:\\s+(?:el\\s+)?(?:juego|peinado))?(?:\\s+(?:de\\s+)?(?:la\\s+)?fallera)?|(?:c[oó]mo\\s+se\\s+llama\\s+)?(?:la\\s+)?peineta\\s+m[aá]s\\s+grande|peineta\\s+(?:del?\\s+)?mo[nñ]o\\s+trasero|(?:cu[aá]l\\s+es\\s+)?(?:la\\s+)?peineta\\s+principal|juego\\s+(?:completo\\s+)?(?:de\\s+)?peinetas?)\\s*[?¿!¡.]*\\s*$';
pintaRasc.item.keywords = [
  ...(pintaRasc.item.keywords || []),
  'cuántas peinetas fallera',
  'peineta más grande pinta',
  'número peinetas juego',
  'peineta moño trasero'
];
console.log('✅ 1.4 pinta y rascamonyos enriched');

// --- 1.5 pinchos vs peinetas (L1632) ← Q8, Q12, Q13 ---
const pinchos = flatFind(kb.es, i => (i.answer || '').includes('agujas pasaderas en forma de espada en miniatura'));
if (!pinchos) throw new Error('pinchos vs peinetas intent not found');
pinchos.item.trigger = 'regex:^\\s*[¿¡]?\\s*(?:(?:qu[eé]\\s+)?diferencia\\s+(?:hay\\s+)?entre\\s+(?:(?:los\\s+)?pinchos?|horquillas?)\\s+(?:y\\s+)?(?:(?:las\\s+)?peinetas?)|(?:para\\s+qu[eé]\\s+sirven?)\\s+(?:los\\s+)?pinchos?\\s+(?:y\\s+)?horquillas?|funci[oó]n\\s+(?:de\\s+)?(?:agujas?|pinchos?|horquillas?)\\s+(?:en\\s+)?(?:el\\s+)?(?:peinado|mo[nñ]o)|pinchos?(?:\\s+(?:y\\s+)?horquillas?)?\\s+(?:del?\\s+)?(?:peinado\\s+)?(?:de\\s+)?faller[ao]?|(?:qu[eé]\\s+)?accesorios?\\s+(?:de\\s+)?joyer[ií]a\\s+(?:(?:se\\s+)?(?:usan?|utilizan?)\\s+)?(?:para\\s+)?(?:(?:decorar|sostener)\\s+)?(?:el\\s+)?peinado|(?:qu[eé]\\s+)?forma\\s+(?:particular\\s+)?(?:tienen|es)\\s+(?:(?:las|los)\\s+)?(?:agujas?|pinchos?)\\s+(?:pasader[ao]s?)?|agujas?\\s+pasader[ao]s?\\s+(?:(?:del?|en)\\s+)?(?:(?:el\\s+)?peinado|(?:la\\s+)?fallera))\\s*[?¿!¡.]*\\s*$';
pinchos.item.keywords = [
  ...(pinchos.item.keywords || []),
  'accesorios joyería peinado',
  'forma espada pinchos',
  'forma pinchos pasaderos',
  'agujas espada miniatura'
];
console.log('✅ 1.5 pinchos vs peinetas enriched');

// --- 1.6 corbata prohibida (L1110) ← Q23 ---
const corbata = flatFind(kb.es, i => (i.answer || '').includes('prohíbe tajantemente el uso de corbatas'));
if (!corbata) throw new Error('corbata intent not found');
corbata.item.trigger = 'regex:^\\s*[¿¡]?\\s*(?:(?:est[aá]|se\\s+)?permit(?:e|ido)\\s+(?:llevar\\s+)?corbata\\s+(?:con\\s+)?(?:el\\s+)?(?:traje\\s+)?(?:de\\s+)?fallero|corbata\\s+(?:traje\\s+)?fallero|(?:se\\s+puede|puedo)\\s+llevar\\s+corbata\\s+(?:en\\s+)?(?:las\\s+)?fallas|corbata\\s+(?:en\\s+)?fallas|(?:permite|autoriza)\\s+(?:la\\s+)?normativa\\s+(?:el\\s+uso\\s+(?:de\\s+)?)?joyas?\\s+(?:modernas?\\s+)?(?:(?:al?|para)\\s+)?(?:(?:el\\s+)?traje\\s+(?:de\\s+)?)?faller[ao]?|joyas?\\s+modernas?\\s+(?:(?:en|con)\\s+)?(?:el\\s+)?traje\\s+(?:de\\s+)?fallero|(?:(?:se\\s+)?permite[en]?|(?:est[aá]n?\\s+)?permitid[ao]s?)\\s+(?:las\\s+)?joyas?\\s+modernas?\\s+(?:(?:al?|en|para)\\s+)?(?:(?:el\\s+)?(?:traje\\s+)?(?:masculino|(?:de\\s+)?faller[ao]?)))\\s*[?¿!¡.]*\\s*$';
corbata.item.keywords = [
  ...(corbata.item.keywords || []),
  'joyas modernas prohibidas fallero',
  'permite normativa joyas',
  'normativa joyas hombre'
];
console.log('✅ 1.6 corbata enriched');

// --- 1.7 bunyols d'or (L1702) ← Q25, Q26 ---
const bunyols = flatFind(kb.es, i => (i.answer || '').includes('Bunyols d\'Or son las máximas condecoraciones'));
if (!bunyols) throw new Error('bunyols intent not found');
bunyols.item.trigger = 'regex:^\\s*[¿¡]?\\s*(?:qu[eé]\\s+(?:son|es)\\s+(?:los\\s+)?bunyols?\\s+d[\\x27\']?or|bunyols?\\s+d[\\x27\']?or|(?:m[aá]xim[ao]s?\\s+)?condecoraci(?:ones?|[oó]n)\\s+(?:de\\s+)?(?:la\\s+)?jcf|insignias?\\s+(?:de\\s+)?(?:la\\s+)?junta\\s+central\\s+fallera|bunyol\\s+d[\\x27\']?or\\s+(?:i\\s+)?brillants?|qu[eé]\\s+(?:son\\s+)?(?:los\\s+)?bunyols?\\s+(?:en\\s+)?(?:la\\s+)?(?:vestimenta|indumentaria)|(?:cu[aá]l|qu[eé])\\s+(?:es\\s+)?(?:la\\s+)?m[aá]xim[ao]\\s+(?:recompensa|insignia|condecoraci[oó]n)\\s+(?:(?:de|para)\\s+)?(?:los\\s+)?falleros?|insignias?\\s+(?:que\\s+)?(?:lucen|llevan|prenden)\\s+(?:los\\s+)?falleros?\\s+(?:sobre\\s+)?(?:(?:el|su)\\s+)?(?:traje|indumentaria))\\s*[?¿!¡.]*\\s*$';
bunyols.item.keywords = [
  ...(bunyols.item.keywords || []),
  'bunyols vestimenta',
  'máxima recompensa fallero',
  'insignia sobre traje',
  'joya honorífica fallera',
  'bunyol brillants fulles llorer'
];
console.log('✅ 1.7 bunyols enriched');

// ═══════════════════════════════════════════
// PHASE 2: CREATE 2 NEW INTENTS
// ═══════════════════════════════════════════

// --- 2.1 Peris Roca → vestimenta.orfebreria ---
const orfebreria = kb.es.vestimenta.orfebreria;
orfebreria.push({
  trigger: 'regex:^\\s*[¿¡]?\\s*(?:(?:qu[eé]\\s+)?(?:otros?\\s+)?(?:maestros?\\s+)?orfebres?\\s+(?:(?:del?\\s+)?(?:centro\\s+)?hist[oó]rico\\s+)?(?:de\\s+)?valencia|peris\\s+roca|(?:d[oó]nde|qui[eé]n)\\s+(?:hace[en]?|fabrica[en]?|crea[en]?)\\s+aderezos?\\s+(?:originales?|artesanales?|valencianos?)|aderezos?\\s+artesanales?\\s+valencia|(?:joyer[ií]a|orfebrer[ií]a)\\s+(?:tradicional\\s+)?(?:(?:del?\\s+)?(?:centro\\s+)?hist[oó]rico|bolser[ií]a))\\s*[?¿!¡.]*\\s*$',
  answer: 'Los orfebres Peris Roca, ubicados en la calle Bolsería 31 del centro histórico de Valencia, son reconocidos como auténticos maestros de los aderezos valencianos, con creaciones artesanales originales que mantienen viva la tradición de la orfebrería fallera.',
  keywords: [
    'peris roca orfebres',
    'bolsería 31 valencia',
    'aderezos artesanales',
    'maestros orfebres valencia',
    'joyería centro histórico',
    'orfebres tradicionales valencianos'
  ],
  followUps: [
    '¿Qué es el aderezo?',
    '¿Qué es la joia?',
    '¿Qué diferencias hay entre joyas del XVIII y XIX?'
  ]
});
console.log('✅ 2.1 Peris Roca created');

// --- 2.2 Adornos permitidos hombre → vestimenta.hombres ---
const hombres = kb.es.vestimenta.hombres;
// Insert after the corbata intent (which is about prohibition)
const corbataIdx = hombres.findIndex(i => (i.answer || '').includes('prohíbe tajantemente'));
if (corbataIdx === -1) throw new Error('corbata hombres index not found');
hombres.splice(corbataIdx + 1, 0, {
  trigger: 'regex:^\\s*[¿¡]?\\s*(?:(?:cu[aá]les\\s+)?(?:son\\s+)?(?:los\\s+)?adornos?\\s+(?:principales?\\s+)?(?:permitidos?|autorizados?)\\s+(?:(?:para|del?)\\s+)?(?:el\\s+)?(?:hombre\\s+)?faller[ao]?|(?:qu[eé]\\s+)?(?:decoraci[oó]n|adornos?)\\s+(?:(?:tiene|lleva|puede\\s+llevar)\\s+)?(?:el\\s+)?traje\\s+(?:masculino|(?:de\\s+)?fallero)|adornos?\\s+(?:del?\\s+)?traje\\s+(?:de\\s+)?fallero|(?:si\\s+no\\s+(?:se\\s+)?(?:pueden?|permite[en]?)\\s+joyas?[,.]?\\s*)?qu[eé]\\s+(?:adornos?|complementos?)\\s+(?:puede|lleva)\\s+(?:un\\s+)?fallero)\\s*[?¿!¡.]*\\s*$',
  answer: 'La indumentaria masculina fallera prima la austeridad: al estar prohibidas las joyas, corbatas y lazos modernos, el adorno decorativo recae en prendas textiles como la faja de colores vivos y el mocador (pañuelo) anudado a la cabeza, que aportan el toque de distinción sin contravenir la normativa.',
  keywords: [
    'adornos permitidos fallero',
    'decoración traje masculino',
    'faja colores fallero',
    'mocador adorno',
    'austeridad traje hombre',
    'complementos permitidos hombre'
  ],
  followUps: [
    '¿Está permitida la corbata?',
    '¿Qué es el pañuelo fallero?',
    '¿Cómo se visten los hombres?'
  ]
});
console.log('✅ 2.2 Adornos permitidos hombre created');

// ═══════════════════════════════════════════
// PHASE 3: VALIDATE & SAVE
// ═══════════════════════════════════════════

const AFTER = countIntents(kb.es);
console.log(`\nTOTAL intents: ${AFTER} (was ${BEFORE})`);

// Validate JSON
const output = JSON.stringify(kb, null, 2);
JSON.parse(output); // will throw if invalid
console.log('✅ JSON valid');

// Validate all new regex triggers compile
const { flattenKnowledgeBase, buildRegexTriggers } = require('./src/js/app.js');
const items = flattenKnowledgeBase(kb.es);
let regexErrors = 0;
for (const item of items) {
  try {
    buildRegexTriggers(item.trigger);
  } catch (e) {
    console.error('❌ Trigger compile error:', item.trigger.substring(0, 80), e.message);
    regexErrors++;
  }
}
if (regexErrors) {
  console.error(`\n❌ ${regexErrors} regex compile errors — NOT saving`);
  process.exit(1);
}
console.log(`✅ All regex triggers compile OK`);

fs.writeFileSync(KB_PATH, output, 'utf8');
console.log('✅ knowledge.json saved');
