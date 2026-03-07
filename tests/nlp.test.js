const {
  flattenKnowledgeBase,
  cleanText,
  buildRegexTriggers,
  buildFuseDataset,
  actualizarFuse,
  buscarConFuse,
  findDirectResponse,
  getTemporalAnswer,
  resolveFuseRuntimeConfig,
  buildFuseDebugEntry,
  evaluateFuseStrategy,
  resolveResponseStrategy,
} = require('../src/js/app.js');
const fs = require('fs');
const path = require('path');

describe('NLP Engine & Three-Layer Search', () => {
  let kb;
  
  beforeAll(() => {
    const kbPath = path.resolve(__dirname, '../src/data/knowledgeBase.json');
    kb = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  });

  test('flattenKnowledgeBase should extract all items from nested structure (ES)', () => {
    const esData = kb.es;
    const flat = flattenKnowledgeBase(esData);
    
    // Verificar que hay elementos de diferentes categorías
    const triggers = flat.map(i => i.trigger).flat();
    
    // Check for general knowledge
    expect(triggers.some(t => t.includes('hola'))).toBe(true);
    
    // Check for nested category: vestimenta
    expect(triggers.some(t => t.includes('vestimenta'))).toBe(true);
    
    // Check for nested category: pirotecnia
    expect(triggers.some(t => t.includes('mascleta'))).toBe(true);
    
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
    
    // Buscar el item de la mascletà que tiene un array de triggers
    const mascletaItem = flat.find(i => Array.isArray(i.trigger) && i.trigger.includes('mascleta'));
    expect(mascletaItem).toBeDefined();
    expect(mascletaItem.answer).toBeDefined();
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
    const flat = flattenKnowledgeBase(kb.es);
    const directResponses = flat
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

    const directMatch = findDirectResponse('como te llamas', directResponses);
    const responseText = Array.isArray(directMatch?.text)
      ? directMatch.text.join(' ')
      : String(directMatch?.text || '');

    expect(directMatch).toBeDefined();
    expect(cleanText(responseText)).toContain('masclet');
    expect(cleanText(responseText)).not.toContain('masclet bot');
  });

  test('cremà date queries should resolve directly across phrasing variants', () => {
    const flat = flattenKnowledgeBase(kb.es);
    const directResponses = flat
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

    [
      'que dia es la cremá',
      'cuándo es la cremà',
      'qué noche es la crema',
    ].forEach((query) => {
      const directMatch = findDirectResponse(query, directResponses);
      const responseText = Array.isArray(directMatch?.text)
        ? directMatch.text.join(' ')
        : String(directMatch?.text || '');

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
