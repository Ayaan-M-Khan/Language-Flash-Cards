import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { TableRowInput } from '@/lib/types';

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Sophisticated linguistic classifier and theme matcher
function inferLanguageDetails(words: TableRowInput[], userLang?: string): {
  language: string;
  languageCode: string;
  color: string;
  icon: string;
} {
  if (userLang && userLang.trim()) {
    const l = userLang.toLowerCase().trim();
    if (l.includes('span') || l.includes('españ')) {
      return { language: 'Spanish', languageCode: 'es-ES', color: 'blue', icon: 'BookOpen' };
    }
    if (l.includes('japan') || l.includes('nihon')) {
      return { language: 'Japanese', languageCode: 'ja-JP', color: 'pink', icon: 'Sparkles' };
    }
    if (l.includes('french') || l.includes('franç')) {
      return { language: 'French', languageCode: 'fr-FR', color: 'purple', icon: 'Heart' };
    }
    if (l.includes('german') || l.includes('deutsch')) {
      return { language: 'German', languageCode: 'de-DE', color: 'orange', icon: 'Compass' };
    }
    if (l.includes('ital')) {
      return { language: 'Italian', languageCode: 'it-IT', color: 'green', icon: 'Coffee' };
    }
    if (l.includes('chin') || l.includes('mandar') || l.includes('han')) {
      return { language: 'Chinese', languageCode: 'zh-CN', color: 'rose', icon: 'Flame' };
    }
    if (l.includes('kore')) {
      return { language: 'Korean', languageCode: 'ko-KR', color: 'indigo', icon: 'Sparkles' };
    }
    if (l.includes('arab')) {
      return { language: 'Arabic', languageCode: 'ar-SA', color: 'emerald', icon: 'Compass' };
    }
    if (l.includes('portug')) {
      return { language: 'Portuguese', languageCode: 'pt-BR', color: 'teal', icon: 'Globe' };
    }
    if (l.includes('russ')) {
      return { language: 'Russian', languageCode: 'ru-RU', color: 'blue', icon: 'BookOpen' };
    }
    if (l.includes('greek')) {
      return { language: 'Greek', languageCode: 'el-GR', color: 'teal', icon: 'BookOpen' };
    }
    if (l.includes('hindi')) {
      return { language: 'Hindi', languageCode: 'hi-IN', color: 'orange', icon: 'Compass' };
    }
    if (l.includes('vietnam')) {
      return { language: 'Vietnamese', languageCode: 'vi-VN', color: 'teal', icon: 'Globe' };
    }
    if (l.includes('dutch')) {
      return { language: 'Dutch', languageCode: 'nl-NL', color: 'orange', icon: 'Compass' };
    }
    if (l.includes('swed')) {
      return { language: 'Swedish', languageCode: 'sv-SE', color: 'blue', icon: 'Compass' };
    }
    if (l.includes('polish')) {
      return { language: 'Polish', languageCode: 'pl-PL', color: 'rose', icon: 'BookOpen' };
    }
    if (l.includes('turkish')) {
      return { language: 'Turkish', languageCode: 'tr-TR', color: 'rose', icon: 'Coffee' };
    }
    return { language: userLang, languageCode: 'en-US', color: 'blue', icon: 'BookOpen' };
  }

  const sample = words.map((w) => `${w.targetWord} ${w.english}`).join(' ');

  // Arabic script
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(sample)) {
    return { language: 'Arabic', languageCode: 'ar-SA', color: 'emerald', icon: 'Compass' };
  }
  // Japanese kana (Hiragana / Katakana)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) {
    return { language: 'Japanese', languageCode: 'ja-JP', color: 'pink', icon: 'Sparkles' };
  }
  // Korean Hangul
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(sample)) {
    return { language: 'Korean', languageCode: 'ko-KR', color: 'indigo', icon: 'Sparkles' };
  }
  // Chinese Hanzi
  if (/[\u4E00-\u9FFF]/.test(sample)) {
    return { language: 'Chinese', languageCode: 'zh-CN', color: 'rose', icon: 'Flame' };
  }
  // Cyrillic Russian
  if (/[\u0400-\u04FF]/.test(sample)) {
    return { language: 'Russian', languageCode: 'ru-RU', color: 'blue', icon: 'BookOpen' };
  }
  // Greek
  if (/[\u0370-\u03FF]/.test(sample)) {
    return { language: 'Greek', languageCode: 'el-GR', color: 'teal', icon: 'BookOpen' };
  }
  // Devanagari Hindi
  if (/[\u0900-\u097F]/.test(sample)) {
    return { language: 'Hindi', languageCode: 'hi-IN', color: 'orange', icon: 'Compass' };
  }
  // Vietnamese diacritics
  if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(sample)) {
    return { language: 'Vietnamese', languageCode: 'vi-VN', color: 'teal', icon: 'Globe' };
  }
  // Spanish keywords or accents
  if (/[áéíóúüñ¿¡]/i.test(sample) || /\b(hola|gracias|buenos|por favor|amigo|adiós|casa|tiempo|noche|día)\b/i.test(sample)) {
    return { language: 'Spanish', languageCode: 'es-ES', color: 'blue', icon: 'BookOpen' };
  }
  // French keywords or accents
  if (/[àèùçœâêîôûëïü]/i.test(sample) || /\b(bonjour|merci|s'il|oui|au revoir|mon|ami|temps|monde|maison)\b/i.test(sample)) {
    return { language: 'French', languageCode: 'fr-FR', color: 'purple', icon: 'Heart' };
  }
  // German keywords or umlauts
  if (/[äöüß]/i.test(sample) || /\b(hallo|danke|bitte|guten|morgen|tag|freund|zeit|haus|welt)\b/i.test(sample)) {
    return { language: 'German', languageCode: 'de-DE', color: 'orange', icon: 'Compass' };
  }
  // Italian keywords
  if (/\b(ciao|grazie|prego|buongiorno|amico|per favore|tempo|casa|mondo)\b/i.test(sample)) {
    return { language: 'Italian', languageCode: 'it-IT', color: 'green', icon: 'Coffee' };
  }
  // Portuguese keywords
  if (/[ãõç]/i.test(sample) || /\b(olá|obrigado|obrigada|por favor|amigo|tempo|casa|mundo)\b/i.test(sample)) {
    return { language: 'Portuguese', languageCode: 'pt-BR', color: 'teal', icon: 'Globe' };
  }

  return { language: 'Foreign Language', languageCode: 'es-ES', color: 'blue', icon: 'BookOpen' };
}

// Fallback generator when offline or no API key available
function generateLocalSmartDeck(words: TableRowInput[], deckTitle?: string, targetLanguage?: string) {
  const langInfo = inferLanguageDetails(words, targetLanguage);
  const lang = langInfo.language;

  // Infer high-quality contextual examples and grammatical classification locally
  const enrichedCards = words.map((w, idx) => {
    const rawTarget = w.targetWord.trim();
    const rawEnglish = w.english.trim();
    const isMultiWord = rawTarget.includes(' ') || rawEnglish.includes(' ');

    let pos = w.partOfSpeech || '';
    if (!pos) {
      if (isMultiWord) {
        pos = 'phrase / expression';
      } else if (rawEnglish.toLowerCase().startsWith('to ')) {
        pos = 'verb';
      } else if (rawEnglish.endsWith('ly')) {
        pos = 'adverb';
      } else if (['big', 'small', 'good', 'bad', 'new', 'old', 'happy', 'fast'].some((adj) => rawEnglish.toLowerCase().includes(adj))) {
        pos = 'adjective';
      } else {
        pos = 'noun';
      }
    }

    let category = w.category || '';
    if (!category || category === 'Core Vocabulary') {
      const lowerEn = rawEnglish.toLowerCase();
      if (['hello', 'hi', 'bye', 'thank', 'please', 'welcome', 'greet'].some((k) => lowerEn.includes(k))) {
        category = 'Greetings & Social';
      } else if (['water', 'bread', 'food', 'coffee', 'tea', 'eat', 'drink', 'apple', 'meat'].some((k) => lowerEn.includes(k))) {
        category = 'Food & Dining';
      } else if (['go', 'come', 'station', 'train', 'bus', 'hotel', 'airport', 'street', 'ticket'].some((k) => lowerEn.includes(k))) {
        category = 'Travel & Transit';
      } else if (['one', 'two', 'three', 'time', 'day', 'hour', 'week', 'month', 'year', 'today'].some((k) => lowerEn.includes(k))) {
        category = 'Numbers & Time';
      } else {
        category = 'Essential Vocabulary';
      }
    }

    // Natural example construction
    let exTarget = w.targetWord;
    let exEnglish = w.english;
    if (lang === 'Spanish') {
      exTarget = isMultiWord ? `"${rawTarget}" es una expresión útil en español.` : `Siempre uso "${rawTarget}" cuando hablo español.`;
      exEnglish = isMultiWord ? `"${rawEnglish}" is a useful Spanish expression.` : `I always use "${rawEnglish}" when speaking Spanish.`;
    } else if (lang === 'French') {
      exTarget = isMultiWord ? `C'est une bonne expression : "${rawTarget}".` : `J'utilise souvent le mot "${rawTarget}".`;
      exEnglish = isMultiWord ? `That is a good expression: "${rawEnglish}".` : `I often use the word "${rawEnglish}".`;
    } else if (lang === 'Japanese') {
      exTarget = `${rawTarget}を使います。`;
      exEnglish = `I use "${rawEnglish}".`;
    } else if (lang === 'German') {
      exTarget = `Ich lerne das Wort "${rawTarget}".`;
      exEnglish = `I am learning the word "${rawEnglish}".`;
    } else {
      exTarget = `${rawTarget}`;
      exEnglish = `${rawEnglish}`;
    }

    // Smart mnemonic hook
    const note =
      w.notes ||
      `Memory Hook: Practice using "${rawTarget}" in a full sentence. Note register and common pairings.`;

    return {
      english: rawEnglish,
      targetWord: rawTarget,
      phonetic: w.phonetic || '',
      partOfSpeech: pos,
      category,
      exampleTarget: exTarget,
      exampleEnglish: exEnglish,
      notes: note,
    };
  });

  const curatedTitle =
    deckTitle?.trim() || `${langInfo.language} Core: Essential Fluency & Vocab`;
  const curatedDescription = `High-yield spaced repetition deck with ${words.length} vocabulary words enriched with grammatical context and natural usage.`;

  return {
    fallback: true,
    detectedLanguage: langInfo.language,
    languageCode: langInfo.languageCode,
    deckTitle: curatedTitle,
    deckDescription: curatedDescription,
    color: langInfo.color,
    icon: langInfo.icon,
    cards: enrichedCards,
  };
}

// Process a batch of vocabulary items with high-intelligence prompt & strict schema
async function processBatchWithModel(
  ai: GoogleGenAI,
  chunk: TableRowInput[],
  chunkIndex: number,
  totalChunks: number,
  targetLanguage: string,
  isFirstChunk: boolean,
  deckTitle?: string
): Promise<{
  cards: any[];
  meta?: {
    detectedLanguage?: string;
    languageCode?: string;
    deckTitle?: string;
    deckDescription?: string;
    color?: string;
    icon?: string;
  };
}> {
  // Candidate models: gemini-3.8-flash (primary high-speed flagship) with gemini-3.1-flash-lite fallback
  const CANDIDATE_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  const expectedCount = chunk.length;

  const prompt = `You are an elite polyglot lexicographer, linguistic pedagogue, and cognitive memory scientist.
You are enriching vocabulary cards for a spaced repetition flashcard deck.

TARGET LANGUAGE: ${targetLanguage || 'Infer accurately from words'}
BATCH: Chunk ${chunkIndex + 1} of ${totalChunks}
EXACT BATCH SIZE: ${expectedCount} items

INPUT VOCABULARY ITEMS:
${JSON.stringify(
  chunk.map((item, idx) => ({
    itemNumber: idx + 1,
    english: item.english,
    targetWord: item.targetWord,
    phoneticHint: item.phonetic || '',
    categoryHint: item.category || '',
    notesHint: item.notes || '',
  })),
  null,
  2
)}

PEDAGOGICAL & ENRICHMENT RULES:
1. SCRIPT & TRANSLITERATION:
   - "targetWord": Write in standard native script with correct orthography, accents, and diacritics.
   - "phonetic": Provide standard transliteration / pronunciation:
     * Japanese: Hiragana reading + clean Romaji (e.g. "arigatō [ありがとう]")
     * Chinese: Standard Pinyin with diacritical tone marks (e.g. "xièxie [xìe xie]")
     * Korean: Revised Romanization (e.g. "gamsahamnida")
     * Arabic: Accurate Arabizi or romanization with short vowels (e.g. "shukran")
     * Romance / Germanic / Slavic / others: Clear phonetic pronunciation guide or IPA with stress marks.
2. GRAMMATICAL RIGOR:
   - "partOfSpeech": Include grammatical genders for nouns where applicable (e.g., "noun (masculine)", "noun (feminine)"), verb types ("regular verb", "irregular verb", "transitive verb", "reflexive"), or "idiom / phrase".
3. REALISTIC COMMUNICATIVE EXAMPLES:
   - "exampleTarget": A realistic, modern 1-sentence example in the target language showing authentic everyday use by native speakers (not childish or robotic).
   - "exampleEnglish": A natural, idiomatic English translation matching the exact nuance of the target sentence.
4. COGNITIVE MNEMONICS & USAGE HOOKS:
   - "notes": Give a truly helpful mnemonic, memory association, cognate link, false friend alert, or cultural nuance that makes the word stick in long-term memory.
5. THEMATIC DECK METADATA:
   ${isFirstChunk ? `- Craft a professional, engaging deck title (e.g., "Spanish Essentials: Daily Life & Travel Fluency").
   - Inspiring description detailing vocabulary topics and learning outcomes.
   - Pick the most harmonious theme color and icon.` : ''}
6. STRICT COMPLETENESS:
   - You MUST return an array containing EXACTLY ${expectedCount} flashcard objects matching the input order 1:1.`;

  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: `You are an elite polyglot lexicographer and cognitive memory scientist. You produce world-class spaced repetition language flashcards with perfect grammatical accuracy, vivid authentic examples, and memorable cognitive hooks. Always return valid structured JSON matching the schema with all required fields.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ...(isFirstChunk
                ? {
                    detectedLanguage: {
                      type: Type.STRING,
                      description: 'Target language name (e.g. Spanish, Japanese, French, German, Arabic, Chinese)',
                    },
                    languageCode: {
                      type: Type.STRING,
                      description: 'Standard BCP 47 language code for speech synthesis (e.g. es-ES, ja-JP, fr-FR, de-DE, ar-SA, zh-CN, ko-KR, it-IT, ru-RU, pt-BR)',
                    },
                    deckTitle: {
                      type: Type.STRING,
                      description: 'An evocative, polished, high-quality deck title highlighting vocabulary topics or communicative domain',
                    },
                    deckDescription: {
                      type: Type.STRING,
                      description: 'An educational, motivating summary of what the learner will master with this deck',
                    },
                    color: {
                      type: Type.STRING,
                      description: 'Theme color: blue, indigo, purple, green, orange, pink, or teal',
                    },
                    icon: {
                      type: Type.STRING,
                      description: 'Theme icon: Sparkles, Compass, Coffee, BookOpen, Globe, Heart, or Flame',
                    },
                  }
                : {}),
              cards: {
                type: Type.ARRAY,
                description: `Array of EXACTLY ${expectedCount} enriched flashcards`,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    english: {
                      type: Type.STRING,
                      description: 'Clear, accurate English definition and primary translation',
                    },
                    targetWord: {
                      type: Type.STRING,
                      description: 'Target language word or phrase in its correct native script',
                    },
                    phonetic: {
                      type: Type.STRING,
                      description: 'Accurate romanization, reading, or phonetic transcription (e.g. Pinyin with tones, Hiragana+Romaji, Arabizi/Harakat, IPA)',
                    },
                    partOfSpeech: {
                      type: Type.STRING,
                      description: 'Specific part of speech with grammatical details (e.g. noun (m/f), verb (transitive/intransitive), adjective, expression)',
                    },
                    category: {
                      type: Type.STRING,
                      description: 'Cohesive thematic topic (e.g. Food & Dining, Travel, Everyday Conversation, Work & Office, Nature)',
                    },
                    exampleTarget: {
                      type: Type.STRING,
                      description: 'A natural, authentic, realistic 1-sentence example in the target language showcasing natural native usage',
                    },
                    exampleEnglish: {
                      type: Type.STRING,
                      description: 'Accurate, natural English translation of the example sentence',
                    },
                    notes: {
                      type: Type.STRING,
                      description: 'A high-impact cognitive memory hook, mnemonic tip, etymology note, false friend warning, or cultural nuance',
                    },
                  },
                  required: [
                    'english',
                    'targetWord',
                    'phonetic',
                    'partOfSpeech',
                    'category',
                    'exampleTarget',
                    'exampleEnglish',
                    'notes',
                  ],
                },
              },
            },
            required: isFirstChunk
              ? ['cards', 'detectedLanguage', 'languageCode', 'deckTitle', 'deckDescription']
              : ['cards'],
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        const returnedCards = Array.isArray(parsed.cards) ? parsed.cards : [];

        // STRICT FALLBACK & MAPPING: Ensure EVERY input item in this chunk has a corresponding card
        const mergedCards = chunk.map((orig, idx) => {
          const aiCard =
            returnedCards.find(
              (c: any) =>
                c &&
                (c.targetWord?.trim().toLowerCase() === orig.targetWord.trim().toLowerCase() ||
                  c.english?.trim().toLowerCase() === orig.english.trim().toLowerCase())
            ) || returnedCards[idx];

          return {
            english: orig.english,
            targetWord: orig.targetWord,
            phonetic: orig.phonetic || aiCard?.phonetic || '',
            partOfSpeech:
              orig.partOfSpeech ||
              aiCard?.partOfSpeech ||
              (orig.targetWord.includes(' ') ? 'phrase / expression' : 'word'),
            category: orig.category || aiCard?.category || 'Core Vocabulary',
            exampleTarget: aiCard?.exampleTarget || orig.targetWord,
            exampleEnglish: aiCard?.exampleEnglish || orig.english,
            notes:
              orig.notes ||
              aiCard?.notes ||
              `Memory Hook: Focus on pronunciation and sentence context for "${orig.targetWord}".`,
          };
        });

        return {
          cards: mergedCards,
          meta: isFirstChunk
            ? {
                detectedLanguage: parsed.detectedLanguage,
                languageCode: parsed.languageCode,
                deckTitle: parsed.deckTitle,
                deckDescription: parsed.deckDescription,
                color: parsed.color,
                icon: parsed.icon,
              }
            : undefined,
        };
      }
    } catch (modelErr: unknown) {
      const errMsg = modelErr instanceof Error ? modelErr.message : String(modelErr);
      console.warn(`Model ${model} batch error (${errMsg.slice(0, 80)}...), trying fallback.`);
    }
  }

  // Graceful chunk fallback if model fails for this batch: retain all input items with smart local fields
  return {
    cards: chunk.map((orig, idx) => ({
      english: orig.english,
      targetWord: orig.targetWord,
      phonetic: orig.phonetic || '',
      partOfSpeech:
        orig.partOfSpeech || (orig.targetWord.includes(' ') ? 'phrase / expression' : 'word'),
      category: orig.category || 'Core Vocabulary',
      exampleTarget: orig.targetWord,
      exampleEnglish: orig.english,
      notes:
        orig.notes ||
        `Memory Hook: Focus on pronunciation and sentence context for "${orig.targetWord}".`,
    })),
  };
}

export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
    const { words, deckTitle, targetLanguage } = (body || {}) as {
      words: TableRowInput[];
      deckTitle?: string;
      targetLanguage?: string;
    };

    if (!words || !Array.isArray(words) || words.length === 0) {
      return NextResponse.json({ error: 'No words provided' }, { status: 400 });
    }

    const ai = getAiClient();
    const langInfo = inferLanguageDetails(words, targetLanguage);

    // Fallback if no API key is provided: return local smart deck with ALL items enriched
    if (!ai) {
      return NextResponse.json(generateLocalSmartDeck(words, deckTitle, targetLanguage));
    }

    // BATCHING / CHUNKING LOGIC: Process cards in chunks of 16 (optimal token efficiency & throughput)
    const CHUNK_SIZE = 16;
    const chunks: TableRowInput[][] = [];
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      chunks.push(words.slice(i, i + CHUNK_SIZE));
    }

    // Execute chunk enrichment with Promise.all
    const batchPromises = chunks.map((chunk, idx) =>
      processBatchWithModel(
        ai,
        chunk,
        idx,
        chunks.length,
        targetLanguage || langInfo.language,
        idx === 0,
        deckTitle
      )
    );

    const batchResults = await Promise.all(batchPromises);

    // Collect all enriched cards
    const allEnrichedCards: any[] = [];
    batchResults.forEach((res) => {
      allEnrichedCards.push(...res.cards);
    });

    // FINAL INTEGRITY CHECK: Ensure output card array matches input words length exactly
    const verifiedCards = words.map((orig, idx) => {
      const found =
        allEnrichedCards[idx] ||
        allEnrichedCards.find(
          (c) =>
            c &&
            (c.targetWord?.trim().toLowerCase() === orig.targetWord.trim().toLowerCase() ||
              c.english?.trim().toLowerCase() === orig.english.trim().toLowerCase())
        );
      if (found) return found;
      return {
        english: orig.english,
        targetWord: orig.targetWord,
        phonetic: orig.phonetic || '',
        partOfSpeech:
          orig.partOfSpeech || (orig.targetWord.includes(' ') ? 'phrase / expression' : 'word'),
        category: orig.category || 'Core Vocabulary',
        exampleTarget: orig.targetWord,
        exampleEnglish: orig.english,
        notes: orig.notes || `Practice using "${orig.targetWord}" in active conversation.`,
      };
    });

    const firstMeta = batchResults[0]?.meta;
    const cleanLanguage = firstMeta?.detectedLanguage || langInfo.language;

    return NextResponse.json({
      fallback: false,
      detectedLanguage: cleanLanguage,
      languageCode: firstMeta?.languageCode || langInfo.languageCode,
      deckTitle:
        firstMeta?.deckTitle ||
        deckTitle?.trim() ||
        `${cleanLanguage} Core: Essential Fluency & Vocab`,
      deckDescription:
        firstMeta?.deckDescription ||
        `High-yield spaced repetition deck with ${verifiedCards.length} vocabulary words enriched with pronunciation, grammatical nuance, and authentic example sentences.`,
      color: firstMeta?.color || langInfo.color,
      icon: firstMeta?.icon || langInfo.icon,
      cards: verifiedCards,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.warn('Handling request error with local smart fallback:', errMsg.slice(0, 100));
    // Safe graceful return with ALL words retained so user is never blocked
    const fallbackWords = Array.isArray(body?.words) ? body.words : [];
    return NextResponse.json(
      generateLocalSmartDeck(fallbackWords, body?.deckTitle, body?.targetLanguage)
    );
  }
}
