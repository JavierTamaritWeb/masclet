const {
  flattenKnowledgeBase,
  cleanText,
  buildRegexTriggers,
  buildFuseDataset,
  actualizarFuse,
  buscarConFuse,
  findDirectResponse,
  getTemporalAnswer,
  resolveLanguageKey,
  resolveLanguageData,
  buildLanguageResponseState,
  getLanguageConfig,
  applyPageMetadata,
  resolveFuseRuntimeConfig,
  buildFuseDebugEntry,
  evaluateFuseStrategy,
  resolveResponseStrategy,
} = require('../src/js/app.js');
const fs = require('fs');
const path = require('path');

describe('NLP Engine & Three-Layer Search', () => {
  let kb;

  const buildDirectResponses = (lang) => flattenKnowledgeBase(kb[lang])
    .map((item) => {
      const triggers = buildRegexTriggers(item.trigger);
      if (!triggers.length) return null;

      return {
        trigger: triggers.length === 1 ? triggers[0] : triggers,
        text: item.answer || item.text,
        followUp: item.followUps || item.followUp || [],
      };
    })
    .filter(Boolean);

  const getResponseText = (response) => Array.isArray(response?.text)
    ? response.text.join(' ')
    : String(response?.text || '');
  
  beforeAll(() => {
    const kbPath = path.resolve(__dirname, '../src/data/knowledge.json');
    kb = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  });

  test('flattenKnowledgeBase should extract all items from nested structure (ES)', () => {
    const esData = kb.es;
    const flat = flattenKnowledgeBase(esData);
    
    // Verificar que hay elementos de diferentes categorías
    const triggers = flat
      .map((item) => Array.isArray(item.trigger) ? item.trigger.join(' ') : String(item.trigger))
      .map((value) => cleanText(value));
    
    // Check for general knowledge
    expect(triggers.some(t => t.includes('hola'))).toBe(true);
    
    // Check for nested category: vestimenta
    expect(triggers.some(t => t.includes('vestimenta'))).toBe(true);
    
    // Check for nested category: pirotecnia
    expect(triggers.some(t => t.includes('masclet'))).toBe(true);
    
    // Check for followUps
    const itemWithFollowUps = flat.find(i => i.followUps && i.followUps.length > 0);
    expect(itemWithFollowUps).toBeDefined();
  });

  test('cleanText should remove stop words and diacritics', () => {
    const input = '¿Cómo estás en la Plaza del Ayuntamiento?';
    const cleaned = cleanText(input);
    
    // 'en', 'la', 'del' are stop words. '¿' and '?' are not explicitly filtered in cleanText but common in triggers.
    // removeDiacritics should handle 'ó' -> 'o'
    expect(cleaned).toContain('como');
    expect(cleaned).not.toContain(' la ');
    expect(cleaned).not.toContain(' en ');
  });

  test('Multiple triggers in an array should be flattened correctly', () => {
    const esData = kb.es;
    const flat = flattenKnowledgeBase(esData);
    
    const itemWithTriggerArray = flat.find((item) => Array.isArray(item.trigger) && item.trigger.length > 1);

    expect(itemWithTriggerArray).toBeDefined();
    expect(buildRegexTriggers(itemWithTriggerArray.trigger)).toHaveLength(itemWithTriggerArray.trigger.length);
  });

  test('buildRegexTriggers should support explicit regex triggers', () => {
    const [trigger] = buildRegexTriggers('regex:^\\s*(?:who\\s+are\\s+you)\\s*[?!.]*\\s*$');

    expect(trigger).toBeInstanceOf(RegExp);
    expect(trigger.test('who are you?')).toBe(true);
    expect(trigger.test('what are you?')).toBe(false);
  });

  test('language helpers should resolve selected language and localized defaults', () => {
    expect(resolveLanguageKey('EN')).toBe('en');
    expect(resolveLanguageKey('xx')).toBe('es');

    const resolved = resolveLanguageData(kb, 'va');
    const runtimeState = buildLanguageResponseState(resolved.langData, resolved.language);

    expect(resolved.language).toBe('va');
    expect(runtimeState.responses.length).toBeGreaterThan(0);
    expect(runtimeState.defaultFollowUps).toEqual(
      expect.arrayContaining(['Com funciona aquest xatbot?', 'Cremà'])
    );
    expect(getLanguageConfig('fr').ui.inputPlaceholder).toContain('Écrivez');
    expect(getLanguageConfig('en').page.documentTitle).toBe('Masclet Fallas Bot');
    expect(getLanguageConfig('va').page.headerSubtitle).toContain('Pregunta\'m');
  });

  test('applyPageMetadata should be a no-op in environments without document', () => {
    expect(() => applyPageMetadata(getLanguageConfig('es'))).not.toThrow();
  });

  test('buildFuseDataset should generate normalized searchable fields and tolerate missing keywords', () => {
    const flat = flattenKnowledgeBase(kb.es);
    const dataset = buildFuseDataset(flat);

    expect(dataset.length).toBe(flat.length);
    const sample = dataset.find((item) => item.keywordsStr.includes('socarrat'));
    const withoutKeywords = buildFuseDataset([{ trigger: 'hola', answer: 'hola', followUps: [] }])[0];

    expect(sample).toBeDefined();
    expect(typeof sample.normalized).toBe('string');
    expect(typeof sample.keywordsStr).toBe('string');
    expect(Array.isArray(sample.followUp)).toBe(true);
    expect(typeof sample.entryId).toBe('string');
    expect(withoutKeywords.keywordsStr).toBe('');
  });

  test('keyword coverage should extend to es, va, en and fr blocks', () => {
    const countKeywordEntries = (lang) => flattenKnowledgeBase(kb[lang])
      .filter((item) => Array.isArray(item.keywords) && item.keywords.length > 0)
      .length;

    expect(countKeywordEntries('es')).toBeGreaterThan(25);
    expect(countKeywordEntries('va')).toBeGreaterThan(8);
    expect(countKeywordEntries('en')).toBeGreaterThan(8);
    expect(countKeywordEntries('fr')).toBeGreaterThan(8);
  });

  test('Fuse search should tolerate typo and accent variants', () => {
    const flat = flattenKnowledgeBase(kb.es);
    actualizarFuse(flat);

    const typoResults = buscarConFuse('paela valenciana');
    expect(typoResults.length).toBeGreaterThan(0);

    const typoBestText = Array.isArray(typoResults[0].item.text)
      ? typoResults[0].item.text.join(' ')
      : String(typoResults[0].item.text || '');

    expect(cleanText(typoBestText)).toContain('paella');
    expect(typoResults[0].score).toBeLessThan(0.75);

    const accentResults = buscarConFuse('mascleta');
    expect(accentResults.length).toBeGreaterThan(0);

    const accentBestText = Array.isArray(accentResults[0].item.text)
      ? accentResults[0].item.text.join(' ')
      : String(accentResults[0].item.text || '');

    expect(cleanText(accentBestText)).toContain('mascleta');
  });

  test('resolveResponseStrategy should prioritize direct regex matches over Fuse candidates', () => {
    const directTriggers = buildRegexTriggers('hola');
    const directResponses = [
      {
        trigger: directTriggers.length === 1 ? directTriggers[0] : directTriggers,
        text: 'Hola directa',
        followUp: [],
      },
    ];

    const fuseResults = [
      {
        score: 0.04,
        item: {
          text: 'Respuesta de Fuse',
          followUp: ['Paella'],
        },
      },
    ];

    const strategy = resolveResponseStrategy('hola', directResponses, fuseResults, ['Cremà']);

    expect(strategy.mode).toBe('direct');
    expect(strategy.item.text).toBe('Hola directa');
  });

  test('identity queries should resolve directly as Masclet', () => {
    const directResponses = buildDirectResponses('es');

    ['como te llamas', 'quien eres', '¿quién eres?'].forEach((query) => {
      const directMatch = findDirectResponse(query, directResponses);
      const responseText = getResponseText(directMatch);

      expect(directMatch).toBeDefined();
      expect(cleanText(responseText)).toContain('masclet');
      expect(cleanText(responseText)).not.toContain('masclet bot');
    });
  });

  test('identity queries should resolve directly in va, en and fr', () => {
    [
      { lang: 'va', query: 'com te dius' },
      { lang: 'en', query: 'who are you?' },
      { lang: 'fr', query: 'qui es-tu ?' },
    ].forEach(({ lang, query }) => {
      const directResponses = buildDirectResponses(lang);
      const directMatch = findDirectResponse(query, directResponses);
      const responseText = getResponseText(directMatch);

      expect(directMatch).toBeDefined();
      expect(cleanText(responseText)).toContain('masclet');
    });
  });

  test('favorite color personality queries should resolve directly in all languages', () => {
    [
      { lang: 'es', query: 'que color te gusta?', expected: 'rojo' },
      { lang: 'va', query: "quin color t'agrada?", expected: 'roig' },
      { lang: 'en', query: 'what is your favorite color?', expected: 'red' },
      { lang: 'fr', query: 'quelle couleur aimes-tu ?', expected: 'rouge' },
    ].forEach(({ lang, query, expected }) => {
      const directResponses = buildDirectResponses(lang);
      const directMatch = findDirectResponse(query, directResponses);
      const responseText = getResponseText(directMatch);

      expect(directMatch).toBeDefined();
      expect(cleanText(responseText)).toContain(expected);
    });
  });

  test('personality queries about petards and gunpowder should resolve directly in Spanish', () => {
    const directResponses = buildDirectResponses('es');

    const petardoMatch = findDirectResponse('que petardo te gusta mas?', directResponses);
    expect(cleanText(getResponseText(petardoMatch))).toContain('tro bac');

    ['te gusta el olor a pólvora?', 'te gusta olor a pólvora?', 'te gusta el olor de pólvora?', 'que olor te gusta?'].forEach((query) => {
      const polvoraMatch = findDirectResponse(query, directResponses);
      expect(cleanText(getResponseText(polvoraMatch))).toContain('polvora');
      expect(cleanText(getResponseText(polvoraMatch))).toContain('fallas');
    });
  });

  test('favorite smell personality queries should resolve directly in va, en and fr', () => {
    [
      { lang: 'va', query: "quina olor t'agrada?", expected: 'polvora' },
      { lang: 'en', query: 'what smell do you like?', expected: 'gunpowder' },
      { lang: 'fr', query: 'quelle odeur aimes-tu ?', expected: 'poudre' },
    ].forEach(({ lang, query, expected }) => {
      const directResponses = buildDirectResponses(lang);
      const directMatch = findDirectResponse(query, directResponses);
      const responseText = getResponseText(directMatch);

      expect(directMatch).toBeDefined();
      expect(cleanText(responseText)).toContain(expected);
    });
  });

  test('Valencian wellness queries should resolve directly instead of falling back to a generic greeting', () => {
    const directResponses = buildDirectResponses('va');

    ['com estas?', 'com estàs?', 'què tal?'].forEach((query) => {
      const directMatch = findDirectResponse(query, directResponses);
      const responseText = getResponseText(directMatch);

      expect(directMatch).toBeDefined();
      expect(cleanText(responseText)).toContain('estic be');
      expect(cleanText(responseText)).not.toContain('puc ajudar');
    });
  });

  test('Named greetings should resolve directly in va, en and fr', () => {
    [
      { lang: 'va', query: 'hola masclet', expected: 'masclet' },
      { lang: 'en', query: 'hello masclet', expected: 'masclet' },
      { lang: 'fr', query: 'bonjour masclet', expected: 'masclet' },
    ].forEach(({ lang, query, expected }) => {
      const directResponses = buildDirectResponses(lang);
      const directMatch = findDirectResponse(query, directResponses);
      const responseText = getResponseText(directMatch);

      expect(directMatch).not.toBeNull();
      expect(cleanText(responseText)).toContain(expected);
    });
  });

  test('English and French wellness prompts should stay separate from generic greetings', () => {
    [
      { lang: 'en', query: "what's up?", expected: 'doing well', rejected: 'assist you' },
      { lang: 'fr', query: 'ça va ?', expected: 'vais bien', rejected: 'puis je vous aider' },
    ].forEach(({ lang, query, expected, rejected }) => {
      const directResponses = buildDirectResponses(lang);
      const directMatch = findDirectResponse(query, directResponses);
      const responseText = getResponseText(directMatch);
      const normalizedText = cleanText(responseText);

      expect(directMatch).not.toBeNull();
      expect(normalizedText).toContain(expected);
      expect(normalizedText).not.toContain(rejected);
    });
  });

  test('Spanish regex trigger families should disambiguate mascleta and indumentaria queries', () => {
    const directResponses = buildDirectResponses('es');

    const mascletaMatch = findDirectResponse('¿qué es la mascletà?', directResponses);
    expect(cleanText(getResponseText(mascletaMatch))).toContain('14:00');

    const falleraMatch = findDirectResponse('vestido de fallera', directResponses);
    expect(cleanText(getResponseText(falleraMatch))).toContain('corpino');

    const falleroMatch = findDirectResponse('vestido fallero', directResponses);
    expect(cleanText(getResponseText(falleroMatch))).toContain('barretina');
  });

  test('Spanish general prompt families should stay exact and leave themed queries to Fuse', () => {
    const directResponses = buildDirectResponses('es');

    const holaBotMatch = findDirectResponse('hola bot', directResponses);
    expect(holaBotMatch).not.toBeNull();
    expect(cleanText(getResponseText(holaBotMatch))).toContain('asistirte');
    expect(cleanText(getResponseText(holaBotMatch))).not.toContain('chispa');

    ['ayúdame', 'información', 'dime algo', 'quiero saber de las fallas', 'plan para el día'].forEach((query) => {
      expect(findDirectResponse(query, directResponses)).not.toBeNull();
    });

    expect(findDirectResponse('dime sobre la mascletà', directResponses)).toBeNull();

    actualizarFuse(flattenKnowledgeBase(kb.es));
    const mascletaResults = buscarConFuse('dime sobre la mascletà');

    expect(mascletaResults.length).toBeGreaterThan(0);
    expect(cleanText(getResponseText(mascletaResults[0].item))).toContain('mascleta');
  });

  test('cremà date queries should resolve directly across phrasing variants', () => {
    const directResponses = buildDirectResponses('es');

    [
      'que dia es la cremá',
      'cuándo es la cremà',
      'qué noche es la crema',
    ].forEach((query) => {
      const directMatch = findDirectResponse(query, directResponses);
      const responseText = getResponseText(directMatch);

      expect(directMatch).not.toBeNull();
      expect(cleanText(responseText)).toContain('19 marzo');
    });
  });

  test('Fuse search should use keywords for free-form queries', () => {
    const flat = flattenKnowledgeBase(kb.es);
    actualizarFuse(flat);

    const clothingResults = buscarConFuse('ropa tradicional valenciana mujer');
    const clothingTexts = clothingResults.map((result) => {
      const value = result.item.text;
      return Array.isArray(value) ? value.join(' ') : String(value || '');
    });

    expect(clothingResults.length).toBeGreaterThan(0);
    expect(clothingTexts.some((text) => cleanText(text).includes('fallera'))).toBe(true);

    const fireResults = buscarConFuse('quemar monumentos 19 marzo');
    const fireTexts = fireResults.map((result) => {
      const value = result.item.text;
      return Array.isArray(value) ? value.join(' ') : String(value || '');
    });

    expect(fireResults.length).toBeGreaterThan(0);
    expect(fireTexts.some((text) => cleanText(text).includes('crema'))).toBe(true);
  });

  test('evaluateFuseStrategy should return guided fallback when score is mid-confidence', () => {
    const fakeResults = [
      {
        score: 0.74,
        item: {
          text: 'La cremà es el acto final... ',
          followUp: ['¿A qué hora comienza?', '¿Qué se salva del fuego?'],
        },
      },
    ];

    const runtimeConfig = resolveFuseRuntimeConfig({
      directResponseScore: '0.6',
      guidanceScore: '0.78',
    });

    const strategy = evaluateFuseStrategy('quemar monumentos 19 marzo', fakeResults, ['Plantà', 'Cremà'], runtimeConfig);

    expect(strategy.mode).toBe('guided-fallback');
    expect(strategy.response.followUp).toEqual(
      expect.arrayContaining(['¿A qué hora comienza?', '¿Qué se salva del fuego?'])
    );
  });

  test('Fuse search should resolve multilingual keywords in va, en and fr', () => {
    actualizarFuse(flattenKnowledgeBase(kb.va));
    const valencianResults = buscarConFuse('indumentaria valenciana dona');
    expect(valencianResults.length).toBeGreaterThan(0);
    expect(cleanText(valencianResults[0].item.text)).toContain('vestit fallera');

    actualizarFuse(flattenKnowledgeBase(kb.en));
    const englishResults = buscarConFuse('official ambassador of fallas');
    expect(englishResults.length).toBeGreaterThan(0);
    expect(cleanText(englishResults[0].item.text)).toContain('maximum representative');

    actualizarFuse(flattenKnowledgeBase(kb.fr));
    const frenchResults = buscarConFuse('offrande florale a la vierge');
    expect(frenchResults.length).toBeGreaterThan(0);
    expect(cleanText(frenchResults[0].item.text)).toContain('offrande fleurs');
  });

  test('resolveFuseRuntimeConfig should clamp thresholds and enable debug mode', () => {
    const config = resolveFuseRuntimeConfig({
      directResponseScore: '0.58',
      guidanceScore: '0.52',
      debug: 'true',
    });

    expect(config).toEqual({
      directResponseScore: 0.58,
      guidanceScore: 0.58,
      debugEnabled: true,
    });
  });

  test('buildFuseDebugEntry should capture the calibration snapshot shape', () => {
    const runtimeConfig = resolveFuseRuntimeConfig({
      directResponseScore: '0.6',
      guidanceScore: '0.78',
      debug: '1',
    });

    const entry = buildFuseDebugEntry(
      'ofrenda floral',
      [
        {
          score: 0.61234,
          item: {
            trigger: ['ofrenda'],
            text: 'La ofrenda de flores a la Virgen es uno de los actos mas emotivos.',
          },
        },
      ],
      { mode: 'guided-fallback' },
      runtimeConfig
    );

    expect(entry).toMatchObject({
      query: 'ofrenda floral',
      mode: 'guided-fallback',
      topScore: 0.6123,
      directResponseScore: 0.6,
      guidanceScore: 0.78,
    });
    expect(entry.candidates[0].trigger).toContain('ofrenda');
    expect(entry.candidates[0].preview).toContain('La ofrenda de flores');
  });

  test('getTemporalAnswer should understand timestamped day questions', () => {
    const response = getTemporalAnswer('[17:55] que dia es hoy');

    expect(response).not.toBeNull();
    expect(response.text).toContain('Hoy es');
  });
});
