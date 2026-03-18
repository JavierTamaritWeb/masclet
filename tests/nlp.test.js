const {
  flattenKnowledgeBase,
  cleanText,
  buildRegexTriggers,
  buildFuseDataset,
  actualizarFuse,
  buscarConFuse,
  findDirectResponse,
  getTemporalAnswer,
  detectCascadeFamilies,
  resolveCascadeStrategy,
  buildModernImageSources,
  resolveLanguageKey,
  resolveLanguageData,
  buildLanguageResponseState,
  getLanguageConfig,
  applyPageMetadata,
  resolveFuseRuntimeConfig,
  buildFuseDebugEntry,
  evaluateFuseStrategy,
  resolveResponseStrategy,
  expandSynonyms,
  isAnaphoricQuery,
  maybeAddColetilla,
  STOP_WORDS_BY_LANGUAGE,
  PERSONALITY_COLETILLAS,
  CONTEXTUAL_FALLBACK_SUGGESTIONS,
  SYNONYM_TABLE,
  ANAPHORIC_PATTERNS,
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

  test('buildModernImageSources should derive avif and webp preserving suffixes', () => {
    expect(buildModernImageSources('img/masclet.png')).toEqual({
      fallbackSrc: 'img/masclet.png',
      webpSrc: 'img/masclet.webp',
      avifSrc: 'img/masclet.avif',
    });

    expect(buildModernImageSources('img/knowledge/clavel-rojo.jpg?cache=1#hero')).toEqual({
      fallbackSrc: 'img/knowledge/clavel-rojo.jpg?cache=1#hero',
      webpSrc: 'img/knowledge/clavel-rojo.webp?cache=1#hero',
      avifSrc: 'img/knowledge/clavel-rojo.avif?cache=1#hero',
    });

    expect(buildModernImageSources('img/icon.svg')).toBeNull();
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

  test('Spanish clavel offering queries should resolve directly and preserve the three clavel images', () => {
    const rootClavelEntry = kb.es.knowledgeBase.find((item) => Array.isArray(item.images) && item.images.includes('img/knowledge/clavel-rojo.jpg'));
    const nestedClavelEntry = kb.es.festejosReligiosos.ofrendas.find((item) => Array.isArray(item.images) && item.images.includes('img/knowledge/clavel-rojo.jpg'));
    const runtimeState = buildLanguageResponseState(kb.es, 'es');
    const expectedImages = [
      'img/knowledge/clavel-rosa.jpg',
      'img/knowledge/clavel-rojo.jpg',
      'img/knowledge/clavel-blanco.jpg',
    ];

    expect(rootClavelEntry).toBeUndefined();
    expect(nestedClavelEntry).toBeDefined();
    expect(cleanText(nestedClavelEntry.answer)).toContain('clavel comun');

    [
      'qué es un clavel',
      'que es un clavel',
      'qué es el clavel',
      'cual es el clavel',
      '¿Qué flores se usan?',
      'qué flor se usa en la ofrenda',
      'cual es la flor tradicional de la ofrenda',
      'flores de la Virgen de los Desamparados',
      'qué clavel se usa en la ofrenda',
      'clavel de la ofrenda',
      'clavel rojo',
      'clavel blanco',
      'clavel rosa',
    ].forEach((query) => {
      const directMatch = findDirectResponse(query, runtimeState.responses);
      const responseText = getResponseText(directMatch);

      expect(directMatch).not.toBeNull();
      expect(cleanText(responseText)).toContain('clavel comun');
      expect(cleanText(responseText)).toContain('rojo');
      expect(cleanText(responseText)).toContain('blanco');
      expect(cleanText(responseText)).toContain('rosa');
      expect(directMatch.imagen).toEqual(expectedImages);
    });
  });

  test('flattenKnowledgeBase should preserve kbPath metadata for nested entries', () => {
    const flat = flattenKnowledgeBase(kb.es);
    const clavelEntry = flat.find((item) => Array.isArray(item.images) && item.images.includes('img/knowledge/clavel-rojo.jpg'));

    expect(clavelEntry?.kbPath).toBe('festejosReligiosos.ofrendas');
    expect(flat.some((item) => item.kbPath === 'vestimenta.mujeres')).toBe(true);
  });

  test('detectCascadeFamilies should classify multilingual queries into the relevant regex families', () => {
    [
      { lang: 'es', query: 'dime paella valenciana', expectedFamily: 'gastronomy' },
      { lang: 'va', query: 'vestit de fallera', expectedFamily: 'attire' },
      { lang: 'en', query: 'what is the mascleta', expectedFamily: 'events' },
      { lang: 'fr', query: 'quelle odeur aimes tu', expectedFamily: 'personality' },
    ].forEach(({ lang, query, expectedFamily }) => {
      expect(detectCascadeFamilies(query, lang)).toContain(expectedFamily);
    });

    expect(detectCascadeFamilies('que hay hoy', 'es')).toEqual([]);
  });

  test('resolveCascadeStrategy should prioritize event and gastronomy families before generic fallback paths', () => {
    const runtimeConfig = resolveFuseRuntimeConfig({
      directResponseScore: '0.6',
      guidanceScore: '0.78',
    });
    const esState = buildLanguageResponseState(kb.es, 'es');

    const eventStrategy = resolveCascadeStrategy(
      'dime sobre la mascletà',
      esState.responses,
      esState.responsesFlat,
      'es',
      esState.defaultFollowUps,
      runtimeConfig
    );
    const gastronomyStrategy = resolveCascadeStrategy(
      'quiero paella valenciana',
      esState.responses,
      esState.responsesFlat,
      'es',
      esState.defaultFollowUps,
      runtimeConfig
    );

    expect(eventStrategy).not.toBeNull();
    expect(['direct', 'answer']).toContain(eventStrategy.mode);
    expect(cleanText(getResponseText(eventStrategy.item))).toContain('mascleta');
    expect(cleanText(getResponseText(eventStrategy.item))).not.toContain('fiesta ingenio');

    expect(gastronomyStrategy).not.toBeNull();
    expect(['direct', 'answer']).toContain(gastronomyStrategy.mode);
    expect(cleanText(getResponseText(gastronomyStrategy.item))).toContain('paella valenciana');
    expect(cleanText(getResponseText(gastronomyStrategy.item))).not.toContain('informacion muy variada');
  });

  test('resolveCascadeStrategy should keep attire queries separated between fallera and fallero', () => {
    const runtimeConfig = resolveFuseRuntimeConfig({
      directResponseScore: '0.6',
      guidanceScore: '0.78',
    });
    const esState = buildLanguageResponseState(kb.es, 'es');
    const enState = buildLanguageResponseState(kb.en, 'en');

    const esStrategy = resolveCascadeStrategy(
      'vestido fallero',
      esState.responses,
      esState.responsesFlat,
      'es',
      esState.defaultFollowUps,
      runtimeConfig
    );
    const enStrategy = resolveCascadeStrategy(
      'fallera dress',
      enState.responses,
      enState.responsesFlat,
      'en',
      enState.defaultFollowUps,
      runtimeConfig
    );

    expect(esStrategy).not.toBeNull();
    expect(cleanText(getResponseText(esStrategy.item))).toContain('barretina');
    expect(cleanText(getResponseText(esStrategy.item))).not.toContain('corpino');

    expect(enStrategy).not.toBeNull();
    expect(cleanText(getResponseText(enStrategy.item))).toContain('fallera');
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

  test('getTemporalAnswer should understand expanded Spanish temporal variants', () => {
    const currentYear = String(new Date().getFullYear());
    const dayResponse = getTemporalAnswer('que dias es hoy', 'es');
    const dateResponse = getTemporalAnswer('cual es la fecha hoy', 'es');
    const timeResponse = getTemporalAnswer('que horas son', 'es');
    const yearResponse = getTemporalAnswer('cual es el ano actual', 'es');

    expect(dayResponse).not.toBeNull();
    expect(cleanText(dayResponse.text)).toContain('hoy es');

    expect(dateResponse).not.toBeNull();
    expect(dateResponse.text).toContain(currentYear);

    expect(timeResponse).not.toBeNull();
    expect(timeResponse.text).toMatch(/\d{2}:\d{2}/);

    expect(yearResponse).not.toBeNull();
    expect(yearResponse.text).toContain(currentYear);
  });

  test('getTemporalAnswer should localize day, time and year queries in va, en and fr', () => {
    const currentYear = String(new Date().getFullYear());

    [
      { lang: 'va', query: 'quin dia es hui', expected: 'hui es' },
      { lang: 'va', query: 'quina hora es ara', expected: 'hora actual es' },
      { lang: 'va', query: 'quin any estem', expected: currentYear },
      { lang: 'en', query: 'what day is it today', expected: 'today is' },
      { lang: 'en', query: 'what time is it now', expected: 'current time is' },
      { lang: 'en', query: 'what year are we in', expected: currentYear },
      { lang: 'fr', query: 'quel jour sommes nous aujourd hui', expected: 'nous sommes' },
      { lang: 'fr', query: 'quelle heure est il', expected: 'il est' },
      { lang: 'fr', query: 'en quelle annee sommes nous', expected: currentYear },
    ].forEach(({ lang, query, expected }) => {
      const response = getTemporalAnswer(query, lang);

      expect(response).not.toBeNull();
      expect(cleanText(response.text)).toContain(cleanText(expected));
    });
  });

  test('getTemporalAnswer should ignore agenda-like prompts without explicit temporal intent', () => {
    [
      { lang: 'es', query: 'que hay hoy' },
      { lang: 'es', query: 'plan para el dia' },
      { lang: 'va', query: 'que hi ha hui' },
      { lang: 'en', query: 'what is on today' },
      { lang: 'fr', query: 'programme pour aujourd hui' },
    ].forEach(({ lang, query }) => {
      expect(getTemporalAnswer(query, lang)).toBeNull();
    });
  });

  test('getTemporalAnswer should understand timestamped day questions', () => {
    const response = getTemporalAnswer('[17:55] que dias es hoy', 'es');

    expect(response).not.toBeNull();
    expect(response.text).toContain('Hoy es');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: 80 Fallas Q&A intents — Direct regex matching tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Direct regex matching for 80 Fallas Q&A intents', () => {
    let directResponses;

    beforeAll(() => {
      directResponses = buildDirectResponses('es');
    });

    const expectMatch = (query, expectedFragment) => {
      const result = findDirectResponse(query, directResponses);
      expect(result).not.toBeNull();
      const text = getResponseText(result);
      expect(text.toLowerCase()).toContain(expectedFragment.toLowerCase());
    };

    // --- knowledgeBase (general) ---
    test('Q1: ¿Qué son las Fallas?', () => {
      expectMatch('¿Qué son las Fallas?', 'fiesta más universal');
    });

    test('Q2: ¿Cuándo son las Fallas?', () => {
      expectMatch('¿Cuándo son las Fallas?', '15 al 19 de marzo');
    });

    test('Q5: ¿Qué se celebra en las Fallas?', () => {
      expectMatch('¿Qué se celebra en las Fallas?', 'Patrimonio Cultural Inmaterial');
    });

    test('Q6: ¿Qué se puede ver en las Fallas?', () => {
      expectMatch('¿Qué se puede ver en las Fallas?', 'monumentos artísticos');
    });

    test('Q7: ¿Cuántas fallas hay?', () => {
      expectMatch('¿Cuántas fallas hay?', '800');
    });

    test('Q39: ¿Se celebran Fallas fuera de Valencia?', () => {
      expectMatch('¿Se celebran Fallas fuera de Valencia?', 'Comunidad Valenciana');
    });

    // --- historia (nueva subcategoría) ---
    test('Q3: ¿Qué significa la palabra falla?', () => {
      expectMatch('¿Qué significa la palabra falla?', 'facula');
    });

    test('Q4: ¿Cuál es el origen de las Fallas?', () => {
      expectMatch('¿Cuál es el origen de las Fallas?', 'carpinteros');
    });

    test('Q40: ¿Cuántas veces se han suspendido las Fallas?', () => {
      expectMatch('¿Cuántas veces se han suspendido las Fallas?', 'seis ocasiones');
    });

    test('Q41: primer documento histórico', () => {
      expectMatch('¿Cuál es el primer documento histórico de una falla?', '1777');
    });

    test('Q42: tradición gremio carpinteros', () => {
      expectMatch('¿Quiénes iniciaron la tradición?', 'gremio de carpinteros');
    });

    test('Q43: ¿Qué era el parot?', () => {
      expectMatch('¿Qué era el parot?', 'candiles');
    });

    test('Q44: ninot de mitja Quaresma', () => {
      expectMatch('¿Qué es el ninot de mitja Quaresma?', 'Judas');
    });

    test('Q45: fundación JCF', () => {
      expectMatch('¿Cuándo se fundó la Junta Central Fallera?', '1939');
    });

    test('Q46: revista El Traca', () => {
      expectMatch('¿Qué revista impulsó las Fallas?', 'El Traca');
    });

    test('Q47: cancelación 1886', () => {
      expectMatch('¿Por qué no se plantaron fallas en 1886?', 'canon');
    });

    // --- tradiciones (ampliado) ---
    test('Q11: ¿Qué es la Plantà?', () => {
      expectMatch('¿Qué es la Plantà?', 'alzar');
    });

    test('Q12: ¿Cuándo se queman las fallas?', () => {
      expectMatch('¿Cuándo se queman las fallas?', '19 de marzo');
    });

    test('Q24: ¿Qué es la Despertà?', () => {
      expectMatch('¿Qué es la Despertà?', 'trons de bac');
    });

    test('Q25: ¿Qué es la Crida?', () => {
      expectMatch('¿Qué es la Crida?', 'Torres de Serranos');
    });

    test('Q26: Cabalgata del Fuego', () => {
      expectMatch('¿Qué es la Cabalgata del Fuego?', 'correfuegos');
    });

    test('Q56: L\'Alba de les Falles', () => {
      expectMatch('¿Qué es l\'Alba de les Falles?', 'pirotécnicos');
    });

    test('Q57: Cant de l\'Estoreta', () => {
      expectMatch('¿Qué es el Cant de l\'Estoreta?', 'Plaza del Árbol');
    });

    test('Q77: macrodespertà', () => {
      expectMatch('¿Qué es la macrodespertà?', 'trons de bac');
    });

    // --- pirotecnia (ampliado) ---
    test('Q17: horario mascletà', () => {
      expectMatch('¿A qué hora es la mascletà?', '14:00');
    });

    test('Q18: cuántas mascletaes', () => {
      expectMatch('¿Cuántas mascletaes oficiales hay?', '19 mascletaes');
    });

    test('Q23: Nit del Foc', () => {
      expectMatch('¿Qué es la Nit del Foc?', 'fuegos artificiales');
    });

    test('Q62: decibelios mascletà', () => {
      expectMatch('¿Cuántos decibelios alcanza la mascletà?', '120');
    });

    // --- monumentos (ampliado) ---
    test('Q8: ¿Dónde se construyen las fallas?', () => {
      expectMatch('¿Dónde se construyen las fallas?', 'Ciudad del Artista Fallero');
    });

    test('Q9: fallas más famosas', () => {
      expectMatch('¿Cuáles son las fallas más famosas?', 'Sección Especial');
    });

    test('Q10: falla más premiada', () => {
      expectMatch('¿Qué falla gana más premios?', 'Convento Jerusalén');
    });

    test('Q13: Exposición del Ninot', () => {
      expectMatch('¿Qué es la Exposición del Ninot?', 'votación popular');
    });

    test('Q15: Ninot Indultat', () => {
      expectMatch('¿Qué es el Ninot Indultat?', 'Museo Fallero');
    });

    test('Q37: ¿Quiénes construyen las fallas?', () => {
      expectMatch('¿Quiénes construyen las fallas?', 'Artistas Falleros');
    });

    test('Q51: llibret de falla', () => {
      expectMatch('¿Qué es el llibret de falla?', 'versos satíricos');
    });

    test('Q53: Falla de las Fuerzas Armadas', () => {
      expectMatch('¿Qué es la Falla de las Fuerzas Armadas?', 'San Juan de Ribera');
    });

    test('Q59: falla municipal', () => {
      expectMatch('¿Qué es la falla municipal?', 'consistorio');
    });

    test('Q71: Premios Fallas Neutras', () => {
      expectMatch('¿Qué son los premios Fallas Neutras y Sostenibles?', '6.000');
    });

    // --- ofrendas (ampliado) ---
    test('Q20: ¿Cuándo es la Ofrenda?', () => {
      expectMatch('¿Cuándo es la Ofrenda?', '17 y 18 de marzo');
    });

    test('Q21: cuándo quitan las flores', () => {
      expectMatch('¿Cuándo quitan las flores de la ofrenda?', 'manto floral');
    });

    test('Q22: mejores sitios para ver la ofrenda', () => {
      expectMatch('¿Mejores sitios para ver la ofrenda?', 'Plaza de la Reina');
    });

    test('Q78: tecnología ofrenda', () => {
      expectMatch('¿Qué tecnología usa la JCF para la ofrenda?', 'RFID');
    });

    test('Q80: vestidores', () => {
      expectMatch('¿Quiénes son los vestidores?', '50 voluntarios');
    });

    // --- patrones (ampliado) ---
    test('Q79: misa solemne San José', () => {
      expectMatch('¿Se celebra alguna misa religiosa en las Fallas?', 'Catedral de Valencia');
    });

    // --- vestimenta mujeres ---
    test('Q63: espolines', () => {
      expectMatch('¿Quién confecciona los espolines?', 'telares Jacquard');
    });

    test('Q64: rodetes', () => {
      expectMatch('¿Qué son los rodetes?', 'moños');
    });

    test('Q65: pinta y rascamonyos', () => {
      expectMatch('¿Qué son la pinta y los rascamonyos?', 'peinetas');
    });

    test('Q66: ahuecador', () => {
      expectMatch('¿Qué es el ahuecador?', 'miriñaque moderno');
    });

    // --- vestimenta hombres ---
    test('Q30: pañuelo fallero', () => {
      expectMatch('¿Qué es el pañuelo fallero?', 'fumeral');
    });

    test('Q67: ¿se permite corbata?', () => {
      expectMatch('¿Se permite llevar corbata con el traje de fallero?', 'prohíbe');
    });

    test('Q68: ¿se puede desfilar con blusón?', () => {
      expectMatch('¿Se puede desfilar con el blusón?', 'no se considera');
    });

    // --- vestimenta.historia ---
    test('Q81: nombre correcto indumentaria', () => {
      expectMatch('¿Cuál es el nombre correcto del traje de fallera?', 'indumentaria tradicional valenciana');
    });

    test('Q82: 1929 vestimenta específica', () => {
      expectMatch('¿Cuándo se empezó a usar una vestimenta específica en Fallas?', '1929');
    });

    test('Q83: Pepita Samper', () => {
      expectMatch('¿Quién fue Pepita Samper?', 'Miss España');
    });

    test('Q84: antes de 1920', () => {
      expectMatch('¿Cómo vestían los falleros antes de los años 1920?', 'ropa de calle');
    });

    test('Q85: traje negro cucaracha', () => {
      expectMatch('¿Qué es el traje negro de cucaracha?', '1954');
    });

    test('Q86: evolución traje negro', () => {
      expectMatch('¿Cómo evolucionó el traje negro?', 'raso negro');
    });

    test('Q87: fase kitsch años 60', () => {
      expectMatch('¿Qué fue la fase kitsch?', 'lentejuelas');
    });

    test('Q88: no réplica exacta', () => {
      expectMatch('¿Es el traje de fallera una réplica exacta?', 'traje festivo');
    });

    test('Q89: Arrancapins y King Kong', () => {
      expectMatch('¿Qué papel jugaron Arrancapins y King Kong?', 'vanguardia');
    });

    test('Q90: neotradicionalismo', () => {
      expectMatch('¿Qué es el neotradicionalismo?', 'erradicar inventos');
    });

    // --- vestimenta.tejidos ---
    test('Q91: qué es un espolín', () => {
      expectMatch('¿Qué es un espolín?', 'telares Jacquard');
    });

    test('Q92: coste espolín', () => {
      expectMatch('¿Por qué es tan costoso el espolín?', 'cartones perforados');
    });

    test('Q93: dibujo exclusivo ayuntamiento', () => {
      expectMatch('¿De quién es el dibujo del espolín?', 'Ayuntamiento');
    });

    test('Q94: colores espolín', () => {
      expectMatch('¿Cuántos colores tiene un espolín?', '33');
    });

    test('Q95: metros de tela', () => {
      expectMatch('¿Cuántos metros de tela se necesitan para un traje?', '12,50');
    });

    test('Q96: precio seda artesanal', () => {
      expectMatch('¿Cuánto cuesta la seda del espolín?', '1.500');
    });

    // --- vestimenta.mujeres (new) ---
    test('Q97: dos estilos XVIII/XIX', () => {
      expectMatch('¿Cuáles son los dos estilos del traje?', 'farolet');
    });

    test('Q98: traje siglo XVIII', () => {
      expectMatch('¿Cómo es el traje del siglo XVIII?', 'envarado');
    });

    test('Q99: traje siglo XIX farolet', () => {
      expectMatch('¿Cómo es el traje del siglo XIX?', 'abullonadas');
    });

    test('Q100: cuánto cuesta traje', () => {
      expectMatch('¿Cuánto cuesta un traje de fallera?', '600');
    });

    test('Q101: manteleta y delantal', () => {
      expectMatch('¿Qué es la manteleta y el delantal?', 'hombros');
    });

    test('Q102: corpiño negro', () => {
      expectMatch('¿Qué es el corpiño negro?', 'gala');
    });

    test('Q103: chambra', () => {
      expectMatch('¿Qué es la chambra?', 'camisa interior');
    });

    test('Q104: enaguas', () => {
      expectMatch('¿Qué son las enaguas?', 'debajo de la falda');
    });

    test('Q105: mantilla', () => {
      expectMatch('¿Cuándo se usa la mantilla en Fallas?', 'Ofrenda');
    });

    test('Q106: desvelan mantillas FM', () => {
      expectMatch('¿Cuándo se desvelan las mantillas de las Falleras Mayores?', 'secreto');
    });

    // --- vestimenta.hombres (new) ---
    test('Q107: saragüell', () => {
      expectMatch('¿Qué es el saragüell?', 'calzón blanco');
    });

    test('Q108: torrentí', () => {
      expectMatch('¿Qué es el torrentí?', 'pantalón');
    });

    test('Q109: negrilla', () => {
      expectMatch('¿Qué es la negrilla?', 'segundo calzón');
    });

    test('Q110: manta morellana', () => {
      expectMatch('¿Qué es la manta morellana?', 'franjas');
    });

    test('Q111: chopetí', () => {
      expectMatch('¿Qué es el chopetí?', 'chaleco');
    });

    test('Q112: calzado masculino', () => {
      expectMatch('¿Qué calzado puede llevar el fallero?', 'prohíbe');
    });

    // --- vestimenta.peinado ---
    test('Q113: relación peinado vestido', () => {
      expectMatch('¿Qué relación hay entre el peinado y el traje?', 'consonancia');
    });

    test('Q114: tres moños', () => {
      expectMatch('¿Cómo es el peinado de tres moños?', 'Dama de Elche');
    });

    test('Q115: un moño a l\'antiga', () => {
      expectMatch('¿Cómo es el peinado a l\'antiga?', 'moño trasero');
    });

    test('Q116: conflicto normativa moños', () => {
      expectMatch('¿Qué conflicto hay con los moños y la normativa?', 'purista');
    });

    test('Q117: posticería', () => {
      expectMatch('¿Es necesario pelo postizo para el peinado de fallera?', 'posticería');
    });

    test('Q118: conservación mallas', () => {
      expectMatch('¿Cómo se conservan las mallas y rodetes?', 'papel de periódico');
    });

    test('Q119: pinchos vs peinetas', () => {
      expectMatch('¿Qué diferencia hay entre los pinchos y las peinetas?', 'agujas pasaderas');
    });

    // --- vestimenta.orfebreria ---
    test('Q120: aderezo', () => {
      expectMatch('¿Qué es el aderezo de la valenciana?', 'cincelado');
    });

    test('Q121: joyas XVIII vs XIX', () => {
      expectMatch('¿Qué diferencias hay en las joyas del siglo XVIII y XIX?', 'espejuelos');
    });

    test('Q122: joia pieza central', () => {
      expectMatch('¿Qué es la joia del aderezo?', 'pieza central');
    });

    test('Q123: Bunyols d\'Or', () => {
      expectMatch('¿Qué son los Bunyols d\'Or?', 'condecoraciones');
    });

    // --- joyería batch 3: nuevos intents ---
    test('Q124: Peris Roca orfebres', () => {
      expectMatch('¿Qué orfebres destacan en el centro histórico de Valencia?', 'Bolsería 31');
    });

    test('Q125: adornos permitidos hombre', () => {
      expectMatch('¿Cuáles son los adornos permitidos para el fallero?', 'austeridad');
    });

    // --- joyería batch 3: enriquecimiento triggers ---
    test('Q126: nombre conjunto joyas', () => {
      expectMatch('¿cómo se llama el conjunto de joyas de la fallera?', 'aderezo');
    });

    test('Q127: material aderezo', () => {
      expectMatch('¿de qué material se fabrica el aderezo?', 'latón');
    });

    test('Q128: técnica cincelado', () => {
      expectMatch('¿qué técnica artesanal se usa en la orfebrería del aderezo?', 'cincelado');
    });

    test('Q129: piezas principales aderezo', () => {
      expectMatch('¿cuáles son las piezas principales del aderezo?', 'pendientes');
    });

    test('Q130: función joia', () => {
      expectMatch('¿para qué sirve la joia?', 'sujetar');
    });

    test('Q131: collar perlas siglo XIX', () => {
      expectMatch('¿cómo es el collar de perlas del siglo XIX?', 'varias vueltas');
    });

    test('Q132: qué son espejuelos', () => {
      expectMatch('¿qué son los espejuelos?', 'cristal');
    });

    test('Q133: colores espejuelos', () => {
      expectMatch('¿de qué colores son los espejuelos?', 'verdes');
    });

    test('Q134: cuántas peinetas', () => {
      expectMatch('¿cuántas peinetas lleva la fallera?', 'tres');
    });

    test('Q135: peineta más grande', () => {
      expectMatch('¿cuál es la peineta más grande?', 'pinta');
    });

    test('Q136: accesorios joyería peinado', () => {
      expectMatch('¿qué accesorios de joyería lleva el peinado fallero?', 'peinetas');
    });

    test('Q137: forma pinchos', () => {
      expectMatch('¿qué forma tienen los pinchos?', 'espada');
    });

    test('Q138: joyas modernas fallero', () => {
      expectMatch('¿permite la normativa joyas modernas al fallero?', 'prohíbe');
    });

    test('Q139: máxima recompensa fallero', () => {
      expectMatch('¿cuál es la máxima recompensa que puede lucir un fallero?', 'Bunyol');
    });

    // --- comidaTipica.salada ---
    test('Q32: esmorçar fallero', () => {
      expectMatch('¿Qué es el esmorçar?', 'almuerzo valenciano');
    });

    test('Q34: cremaet', () => {
      expectMatch('¿Qué es el cremaet?', 'café');
    });

    // --- organizacion (nueva) ---
    test('Q38: ¿Qué institución organiza las Fallas?', () => {
      expectMatch('¿Qué institución organiza las Fallas?', 'Junta Central Fallera');
    });

    test('Q49: puestos directivos comisión', () => {
      expectMatch('¿Cuáles son los puestos directivos de una comisión?', 'presidente');
    });

    test('Q50: sede JCF', () => {
      expectMatch('¿Dónde está la sede de la JCF?', 'Museo Fallero');
    });

    test('Q54: Gala de la Indumentaria', () => {
      expectMatch('¿Qué es la Gala de la Indumentaria?', 'enero');
    });

    test('Q55: Gala de la Pirotecnia', () => {
      expectMatch('¿Qué es la Gala de la Pirotecnia?', 'calendario');
    });

    test('Q70: Interagrupación', () => {
      expectMatch('¿Qué es la Interagrupación?', 'agrupaciones');
    });

    // --- logistica (nueva) ---
    test('Q27: ropa para la Cremà', () => {
      expectMatch('¿Qué ropa se recomienda para la Cremà?', 'algodón');
    });

    test('Q35: aparcar en Fallas', () => {
      expectMatch('¿Dónde aparcar en Fallas?', 'parkings');
    });

    test('Q36: zonas tranquilas', () => {
      expectMatch('¿Cuáles son las zonas más tranquilas en Fallas?', 'Benimaclet');
    });

    test('Q72: protección del asfalto', () => {
      expectMatch('¿Cómo se protege el asfalto?', 'arena');
    });

    test('Q73: horario verbenas', () => {
      expectMatch('¿A qué hora se apagan las verbenas en Fallas?', '04:00');
    });

    test('Q74: fallas en jardines', () => {
      expectMatch('¿Se pueden plantar fallas en jardines?', 'prohibido');
    });

    test('Q75: carpas desde qué día', () => {
      expectMatch('¿Desde qué día se pueden instalar las carpas?', '6 de marzo');
    });

    test('Q76: accesibilidad PMR', () => {
      expectMatch('¿Hay zonas para personas con movilidad reducida?', 'PMR');
    });

    // --- música (ampliado) ---
    test('Q52: música pasacalles', () => {
      expectMatch('¿Qué música acompaña los pasacalles?', 'Paquito');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Cascade detection for new families
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cascade detection for new families', () => {
    test('history family detected for origin questions', () => {
      const families = detectCascadeFamilies('cual es el origen de las fallas', 'es');
      expect(families).toContain('history');
    });

    test('organization family detected for JCF questions', () => {
      const families = detectCascadeFamilies('que es la junta central fallera', 'es');
      expect(families).toContain('organization');
    });

    test('logistics family detected for parking questions', () => {
      const families = detectCascadeFamilies('donde aparcar en fallas', 'es');
      expect(families).toContain('logistics');
    });

    test('events family detects desperta and cabalgata', () => {
      const families1 = detectCascadeFamilies('que es la desperta', 'es');
      const families2 = detectCascadeFamilies('que es la cabalgata del fuego', 'es');
      expect(families1).toContain('events');
      expect(families2).toContain('events');
    });

    test('attire family detects new vocabulary (espolines, rodetes)', () => {
      const families1 = detectCascadeFamilies('que son los espolines', 'es');
      const families2 = detectCascadeFamilies('que son los rodetes', 'es');
      expect(families1).toContain('attire');
      expect(families2).toContain('attire');
    });

    test('attire family detects indumentaria vocabulary (saragüell, chopetí, mantilla)', () => {
      const families3 = detectCascadeFamilies('que es el saragüell', 'es');
      const families4 = detectCascadeFamilies('que es el chopetí', 'es');
      const families5 = detectCascadeFamilies('cuando se usa la mantilla', 'es');
      expect(families3).toContain('attire');
      expect(families4).toContain('attire');
      expect(families5).toContain('attire');
    });

    test('gastronomy family detects esmorçar and cremaet', () => {
      const families1 = detectCascadeFamilies('que es el esmorcar', 'es');
      const families2 = detectCascadeFamilies('que es el cremaet', 'es');
      expect(families1).toContain('gastronomy');
      expect(families2).toContain('gastronomy');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Variant input forms (natural language variations)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Natural language variants should also match', () => {
    let directResponses;

    beforeAll(() => {
      directResponses = buildDirectResponses('es');
    });

    const expectMatch = (query, expectedFragment) => {
      const result = findDirectResponse(query, directResponses);
      expect(result).not.toBeNull();
      const text = getResponseText(result);
      expect(text.toLowerCase()).toContain(expectedFragment.toLowerCase());
    };

    test('informal: "de donde viene la palabra falla"', () => {
      expectMatch('de donde viene la palabra falla', 'facula');
    });

    test('informal: "fechas de las fallas"', () => {
      expectMatch('fechas de las fallas', '15 al 19');
    });

    test('informal: "que dias son las fallas"', () => {
      expectMatch('que dias son las fallas', '15 al 19');
    });

    test('informal: "quien organiza las fallas"', () => {
      expectMatch('quien organiza las fallas', 'Junta Central Fallera');
    });

    test('sin tildes: "cuando es la crema"', () => {
      expectMatch('cuando es la crema', '19 de marzo');
    });

    test('sin tildes ni signos: "que es el ninot indultat"', () => {
      expectMatch('que es el ninot indultat', 'Museo Fallero');
    });

    test('sin tildes: "donde se construyen las fallas"', () => {
      expectMatch('donde se construyen las fallas', 'Ciudad del Artista');
    });

    test('informal: "como se protege el asfalto"', () => {
      expectMatch('como se protege el asfalto', 'arena');
    });

    test('variation: "cuantas mascletaes hay"', () => {
      expectMatch('cuantas mascletaes hay', '19');
    });

    test('variation: "hay zonas para sillas de ruedas"', () => {
      expectMatch('hay zonas para sillas de ruedas', 'PMR');
    });

    // --- New indumentaria variants ---
    test('sin tildes: "que es el neotradicionalismo"', () => {
      expectMatch('que es el neotradicionalismo', 'erradicar inventos');
    });

    test('sin tildes: "que es un espolin"', () => {
      expectMatch('que es un espolin', 'telares Jacquard');
    });

    test('informal: "cuanto cuesta un traje de fallera"', () => {
      expectMatch('cuanto cuesta un traje de fallera', '600');
    });

    test('sin tildes: "que es el saraguell"', () => {
      expectMatch('que es el saraguell', 'calzón blanco');
    });

    test('sin tildes: "que es la posticeria"', () => {
      expectMatch('posticeria', 'posticería');
    });

    test('sin tildes: "como es el peinado de tres monos"', () => {
      expectMatch('como es el peinado de tres monos', 'Dama de Elche');
    });

    test('informal: "que es el chopeti"', () => {
      expectMatch('que es el chopeti', 'chaleco');
    });

    test('informal: "que es la mantilla de la fallera"', () => {
      expectMatch('que es la mantilla de la fallera', 'Ofrenda');
    });

    test('informal: "que es la joia"', () => {
      expectMatch('que es la joia', 'pieza central');
    });

    test('informal: "que diferencia hay entre espejuelos y perlas"', () => {
      expectMatch('que diferencia hay entre espejuelos y perlas', 'espejuelos');
    });

    // --- New joyería variants ---
    test('informal: "donde estan los orfebres peris roca"', () => {
      expectMatch('donde estan los orfebres peris roca', 'Bolsería');
    });

    test('informal: "que puede llevar de adorno un fallero"', () => {
      expectMatch('que puede llevar de adorno un fallero', 'faja');
    });

    test('informal: "que colores tienen los espejuelos"', () => {
      expectMatch('que colores tienen los espejuelos', 'verdes');
    });

    test('informal: "cuantas peinetas se ponen las falleras"', () => {
      expectMatch('cuantas peinetas se ponen las falleras', 'tres');
    });

    test('informal: "de que estan hechas las joyas de la fallera"', () => {
      expectMatch('de que estan hechas las joyas de la fallera', 'latón');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Fase 1: Diacríticos en matching directo
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 1: Diacritics-insensitive direct matching', () => {
    let directResponses;

    beforeAll(() => {
      directResponses = buildDirectResponses('es');
    });

    test('"musica" without accent should match triggers with "música"', () => {
      const result = findDirectResponse('banda de musica', directResponses);
      expect(result).not.toBeNull();
      const text = Array.isArray(result.text) ? result.text.join(' ') : String(result.text);
      expect(text.toLowerCase()).toContain('banda');
    });

    test('"reposteria" without accent should match trigger "repostería"', () => {
      const result = findDirectResponse('reposteria', directResponses);
      expect(result).not.toBeNull();
    });

    test('"cuando es la crema" should still match cremà trigger', () => {
      const result = findDirectResponse('cuando es la crema', directResponses);
      expect(result).not.toBeNull();
      const text = Array.isArray(result.text) ? result.text.join(' ') : String(result.text);
      expect(text.toLowerCase()).toContain('19 de marzo');
    });

    test('original accented queries still work normally', () => {
      const result = findDirectResponse('¿Qué son las Fallas?', directResponses);
      expect(result).not.toBeNull();
    });

    test('"paella valenciana" with no accents still matches', () => {
      const result = findDirectResponse('paella valenciana', directResponses);
      expect(result).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Fase 2: CASCADE cleanup patterns
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 2: Extended CASCADE cleanup patterns', () => {
    test('resolveCascadeStrategy should clean "qué es la mascletà" through new patterns', () => {
      const runtimeConfig = resolveFuseRuntimeConfig({
        directResponseScore: '0.6',
        guidanceScore: '0.78',
      });
      const esState = buildLanguageResponseState(kb.es, 'es');

      const strategy = resolveCascadeStrategy(
        'qué es la mascletà',
        esState.responses,
        esState.responsesFlat,
        'es',
        esState.defaultFollowUps,
        runtimeConfig
      );

      expect(strategy).not.toBeNull();
      expect(['direct', 'answer']).toContain(strategy.mode);
    });

    test('resolveCascadeStrategy should handle "cuándo es la cremà"', () => {
      const runtimeConfig = resolveFuseRuntimeConfig({
        directResponseScore: '0.6',
        guidanceScore: '0.78',
      });
      const esState = buildLanguageResponseState(kb.es, 'es');

      const strategy = resolveCascadeStrategy(
        'cuándo es la cremà',
        esState.responses,
        esState.responsesFlat,
        'es',
        esState.defaultFollowUps,
        runtimeConfig
      );

      expect(strategy).not.toBeNull();
    });

    test('EN cleanup: "what is the mascleta" should work through CASCADE', () => {
      const runtimeConfig = resolveFuseRuntimeConfig({
        directResponseScore: '0.6',
        guidanceScore: '0.78',
      });
      const enState = buildLanguageResponseState(kb.en, 'en');

      const strategy = resolveCascadeStrategy(
        'what is the mascleta',
        enState.responses,
        enState.responsesFlat,
        'en',
        enState.defaultFollowUps,
        runtimeConfig
      );

      expect(strategy).not.toBeNull();
    });

    test('"cómo se prepara la paella" should work through CASCADE', () => {
      const runtimeConfig = resolveFuseRuntimeConfig({
        directResponseScore: '0.6',
        guidanceScore: '0.78',
      });
      const esState = buildLanguageResponseState(kb.es, 'es');

      const strategy = resolveCascadeStrategy(
        'cómo se prepara la paella',
        esState.responses,
        esState.responsesFlat,
        'es',
        esState.defaultFollowUps,
        runtimeConfig
      );

      expect(strategy).not.toBeNull();
    });

    test('"dónde está la ofrenda" should work through CASCADE', () => {
      const runtimeConfig = resolveFuseRuntimeConfig({
        directResponseScore: '0.6',
        guidanceScore: '0.78',
      });
      const esState = buildLanguageResponseState(kb.es, 'es');

      const strategy = resolveCascadeStrategy(
        'dónde está la ofrenda',
        esState.responses,
        esState.responsesFlat,
        'es',
        esState.defaultFollowUps,
        runtimeConfig
      );

      expect(strategy).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Fase 3: Triggers amplios corregidos
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 3: Broad triggers are now scoped', () => {
    let directResponses;

    beforeAll(() => {
      directResponses = buildDirectResponses('es');
    });

    test('"fuego" alone should NOT match cremà', () => {
      const result = findDirectResponse('fuego', directResponses);
      expect(result).toBeNull();
    });

    test('"fuego de fallas" should match cremà', () => {
      const result = findDirectResponse('fuego de fallas', directResponses);
      expect(result).not.toBeNull();
    });

    test('"la cremà" should match', () => {
      const result = findDirectResponse('la cremà', directResponses);
      expect(result).not.toBeNull();
    });

    test('"banda" alone should NOT match music', () => {
      const result = findDirectResponse('banda', directResponses);
      expect(result).toBeNull();
    });

    test('"banda de musica" should match', () => {
      const result = findDirectResponse('banda de musica', directResponses);
      expect(result).not.toBeNull();
    });

    test('"música fallera" should match', () => {
      const result = findDirectResponse('música fallera', directResponses);
      expect(result).not.toBeNull();
    });

    test('"quemar fallas" still matches cremà', () => {
      const result = findDirectResponse('quemar fallas', directResponses);
      expect(result).not.toBeNull();
    });

    test('"19 marzo" still matches cremà', () => {
      const result = findDirectResponse('19 marzo', directResponses);
      expect(result).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Fase 4: Stop words por idioma
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 4: Language-specific stop words', () => {
    test('cleanText with EN language filters "the" and "of"', () => {
      const cleaned = cleanText('the offering of flowers', 'en');
      expect(cleaned).not.toContain('the');
      expect(cleaned).not.toContain(' of ');
      expect(cleaned).toContain('offering');
      expect(cleaned).toContain('flowers');
    });

    test('cleanText with FR language filters "le" and "des"', () => {
      const cleaned = cleanText('le festival des fallas', 'fr');
      expect(cleaned).not.toMatch(/\ble\b/);
      expect(cleaned).not.toMatch(/\bdes\b/);
      expect(cleaned).toContain('festival');
      expect(cleaned).toContain('fallas');
    });

    test('cleanText with VA language filters "els" and "amb"', () => {
      const cleaned = cleanText('els monuments amb foc', 'va');
      expect(cleaned).not.toMatch(/\bels\b/);
      expect(cleaned).not.toMatch(/\bamb\b/);
      expect(cleaned).toContain('monuments');
    });

    test('STOP_WORDS_BY_LANGUAGE has entries for all 4 languages', () => {
      expect(STOP_WORDS_BY_LANGUAGE.es.length).toBeGreaterThan(10);
      expect(STOP_WORDS_BY_LANGUAGE.va.length).toBeGreaterThan(10);
      expect(STOP_WORDS_BY_LANGUAGE.en.length).toBeGreaterThan(10);
      expect(STOP_WORDS_BY_LANGUAGE.fr.length).toBeGreaterThan(10);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Fase 5: Sinónimos para Fuse.js
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 5: Synonym expansion', () => {
    test('expandSynonyms adds mascleta synonyms for "pirotecnia"', () => {
      const expanded = expandSynonyms('pirotecnia valenciana', 'es');
      expect(expanded).not.toBeNull();
      expect(expanded).toContain('mascleta');
    });

    test('expandSynonyms adds paella for "comida"', () => {
      const expanded = expandSynonyms('comida tipica', 'es');
      expect(expanded).not.toBeNull();
      expect(expanded).toContain('paella');
    });

    test('expandSynonyms returns null when no synonyms found', () => {
      const expanded = expandSynonyms('xyz zzz', 'es');
      expect(expanded).toBeNull();
    });

    test('SYNONYM_TABLE has entries for all 4 languages', () => {
      expect(Object.keys(SYNONYM_TABLE.es).length).toBeGreaterThan(10);
      expect(Object.keys(SYNONYM_TABLE.va).length).toBeGreaterThan(5);
      expect(Object.keys(SYNONYM_TABLE.en).length).toBeGreaterThan(5);
      expect(Object.keys(SYNONYM_TABLE.fr).length).toBeGreaterThan(5);
    });

    test('Fuse search for "pirotecnia valenciana" finds mascleta content', () => {
      actualizarFuse(flattenKnowledgeBase(kb.es));
      const results = buscarConFuse('pirotecnia valenciana');
      expect(results.length).toBeGreaterThan(0);
      const texts = results.map((r) => cleanText(Array.isArray(r.item.text) ? r.item.text.join(' ') : String(r.item.text)));
      expect(texts.some((t) => t.includes('mascleta'))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Fase 6: Personalidad y coletillas
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 6: Personality coletillas', () => {
    test('maybeAddColetilla does not modify text for non-passionate families', () => {
      const item = { families: ['conversation'] };
      const result = maybeAddColetilla('Hola mundo', item, 'es');
      expect(result).toBe('Hola mundo');
    });

    test('PERSONALITY_COLETILLAS has entries for all 4 supported languages', () => {
      expect(PERSONALITY_COLETILLAS.es.length).toBeGreaterThan(3);
      expect(PERSONALITY_COLETILLAS.va.length).toBeGreaterThan(3);
      expect(PERSONALITY_COLETILLAS.en.length).toBeGreaterThan(3);
      expect(PERSONALITY_COLETILLAS.fr.length).toBeGreaterThan(3);
    });

    test('maybeAddColetilla can add coletilla for passionate families (with forced random)', () => {
      const item = { families: ['events'] };
      const originalRandom = Math.random;
      Math.random = () => 0.1; // force probability under 0.25
      try {
        const result = maybeAddColetilla('Respuesta', item, 'es');
        expect(result.length).toBeGreaterThan('Respuesta'.length);
      } finally {
        Math.random = originalRandom;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Fase 7: Easter eggs
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 7: Easter eggs', () => {
    test('ES: "eres una IA?" matches easter egg', () => {
      const directResponses = buildDirectResponses('es');
      const result = findDirectResponse('eres una ia?', directResponses);
      expect(result).not.toBeNull();
      const text = Array.isArray(result.text) ? result.text.join(' ') : String(result.text);
      expect(text.toLowerCase()).toContain('masclet');
    });

    test('ES: "cuéntame un chiste" matches joke', () => {
      const directResponses = buildDirectResponses('es');
      const result = findDirectResponse('cuéntame un chiste', directResponses);
      expect(result).not.toBeNull();
    });

    test('ES: "cuál es tu comida favorita" matches paella answer', () => {
      const directResponses = buildDirectResponses('es');
      const result = findDirectResponse('cuál es tu comida favorita', directResponses);
      expect(result).not.toBeNull();
      const text = Array.isArray(result.text) ? result.text.join(' ') : String(result.text);
      expect(text.toLowerCase()).toContain('paella');
    });

    test('ES: "cuál es tu falla favorita" matches', () => {
      const directResponses = buildDirectResponses('es');
      const result = findDirectResponse('cuál es tu falla favorita', directResponses);
      expect(result).not.toBeNull();
    });

    test('ES: "llueve en fallas" matches', () => {
      const directResponses = buildDirectResponses('es');
      const result = findDirectResponse('llueve en fallas', directResponses);
      expect(result).not.toBeNull();
    });

    test('EN: "are you a robot?" matches', () => {
      const directResponses = buildDirectResponses('en');
      const result = findDirectResponse('are you a robot?', directResponses);
      expect(result).not.toBeNull();
    });

    test('VA: "ets una ia?" matches', () => {
      const directResponses = buildDirectResponses('va');
      const result = findDirectResponse('ets una ia?', directResponses);
      expect(result).not.toBeNull();
    });

    test('FR: "es-tu un robot?" matches', () => {
      const directResponses = buildDirectResponses('fr');
      const result = findDirectResponse('es-tu un robot?', directResponses);
      expect(result).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Fase 8: Anaphoric patterns
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 8: Anaphoric pattern detection', () => {
    test('"dime más" is detected as anaphoric in ES', () => {
      expect(isAnaphoricQuery('dime más', 'es')).toBe(true);
    });

    test('"cuéntame más" is detected as anaphoric in ES', () => {
      expect(isAnaphoricQuery('cuéntame más', 'es')).toBe(true);
    });

    test('"tell me more" is detected as anaphoric in EN', () => {
      expect(isAnaphoricQuery('tell me more', 'en')).toBe(true);
    });

    test('"más" alone is detected as anaphoric', () => {
      expect(isAnaphoricQuery('más', 'es')).toBe(true);
    });

    test('a normal question is NOT anaphoric', () => {
      expect(isAnaphoricQuery('qué es la mascletà', 'es')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Fase 9: Contextual fallback suggestions
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 9: Contextual fallback suggestions', () => {
    test('CONTEXTUAL_FALLBACK_SUGGESTIONS has entries for all languages', () => {
      expect(Object.keys(CONTEXTUAL_FALLBACK_SUGGESTIONS.es).length).toBeGreaterThan(5);
      expect(Object.keys(CONTEXTUAL_FALLBACK_SUGGESTIONS.en).length).toBeGreaterThan(3);
      expect(Object.keys(CONTEXTUAL_FALLBACK_SUGGESTIONS.va).length).toBeGreaterThan(3);
      expect(Object.keys(CONTEXTUAL_FALLBACK_SUGGESTIONS.fr).length).toBeGreaterThan(3);
    });

    test('ES events family has relevant suggestions', () => {
      const suggestions = CONTEXTUAL_FALLBACK_SUGGESTIONS.es.events;
      expect(suggestions).toContain('Mascletà');
      expect(suggestions).toContain('Cremà');
    });

    test('ES gastronomy family has relevant suggestions', () => {
      const suggestions = CONTEXTUAL_FALLBACK_SUGGESTIONS.es.gastronomy;
      expect(suggestions).toContain('Paella');
      expect(suggestions).toContain('Buñuelos');
    });
  });
});
