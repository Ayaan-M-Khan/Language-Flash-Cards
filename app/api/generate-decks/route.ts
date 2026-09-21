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

// Infer language details and formatting when AI models are at capacity or offline
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
    return { language: userLang, languageCode: 'en-US', color: 'blue', icon: 'BookOpen' };
  }

  const sample = words.map((w) => `${w.targetWord} ${w.english}`).join(' ');

  // Arabic script detection
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(sample)) {
    return { language: 'Arabic', languageCode: 'ar-SA', color: 'emerald', icon: 'Compass' };
  }
  // Japanese kana detection
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
  // Spanish keywords or accents
  if (/[áéíóúüñ¿¡]/i.test(sample) || /\b(hola|gracias|buenos|por favor|amigo|adiós|casa)\b/i.test(sample)) {
    return { language: 'Spanish', languageCode: 'es-ES', color: 'blue', icon: 'BookOpen' };
  }
  // French keywords or accents
  if (/[àèùçœâêîôûëïü]/i.test(sample) || /\b(bonjour|merci|s'il|oui|au revoir|mon|ami)\b/i.test(sample)) {
    return { language: 'French', languageCode: 'fr-FR', color: 'purple', icon: 'Heart' };
  }
  // German keywords or umlauts
  if (/[äöüß]/i.test(sample) || /\b(hallo|danke|bitte|guten|morgen|tag|freund)\b/i.test(sample)) {
    return { language: 'German', languageCode: 'de-DE', color: 'orange', icon: 'Compass' };
  }
  // Italian keywords
  if (/\b(ciao|grazie|prego|buongiorno|amico|per favore)\b/i.test(sample)) {
    return { language: 'Italian', languageCode: 'it-IT', color: 'green', icon: 'Coffee' };
  }

  return { language: 'Foreign Language', languageCode: 'es-ES', color: 'blue', icon: 'BookOpen' };
}

function generateLocalSmartDeck(words: TableRowInput[], deckTitle?: string, targetLanguage?: string) {
  const langInfo = inferLanguageDetails(words, targetLanguage);
  return {
    fallback: true,
    detectedLanguage: langInfo.language,
    languageCode: langInfo.languageCode,
    deckTitle: deckTitle?.trim() || `${langInfo.language} Vocabulary Deck`,
    deckDescription: `Smart spaced repetition deck with ${words.length} vocabulary words.`,
    color: langInfo.color,
    icon: langInfo.icon,
    cards: words.map((w, idx) => ({
      english: w.english,
      targetWord: w.targetWord,
      phonetic: w.phonetic || '',
      partOfSpeech: w.partOfSpeech || (w.targetWord.includes(' ') ? 'phrase' : 'word'),
      category: w.category || 'Core Vocabulary',
      exampleTarget: w.targetWord,
      exampleEnglish: w.english,
      notes: w.notes || `Vocabulary item #${idx + 1}`,
    })),
  };
}

// Process a single chunk of vocabulary items with strict count prompting
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
  const CANDIDATE_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
  const expectedCount = chunk.length;

  const prompt = `You are an expert language teacher, polyglot lexicographer, and cognitive scientist.
You are enriching vocabulary cards for a spaced repetition flashcard deck.

TARGET LANGUAGE: ${targetLanguage || 'Infer from words'}
BATCH: Chunk ${chunkIndex + 1} of ${totalChunks}
EXACT BATCH SIZE: ${expectedCount} items

INPUT VOCABULARY ITEMS:
${JSON.stringify(
  chunk.map((item, idx) => ({
    itemNumber: idx + 1,
    english: item.english,
    targetWord: item.targetWord,
    phoneticHint: item.phonetic || '',
    categoryHint: item.category || 'Core Vocabulary',
    notesHint: item.notes || '',
  })),
  null,
  2
)}

STRICT COUNT & COMPLETENESS RULES:
1. You MUST return an array containing EXACTLY ${expectedCount} flashcard objects.
2. The output "cards" array MUST match the exact order of the input list.
3. NEVER skip, combine, omit, or truncate any item. Output length MUST be ${expectedCount}.
4. For each item:
   - "english": Original English word/phrase.
   - "targetWord": Original target language word/phrase in its native script.
   - "phonetic": Accurate phonetic transcription or friendly romanization (e.g., IPA, Pinyin, Romaji, Arabizi).
   - "partOfSpeech": noun, verb, adjective, phrase, expression, or adverb.
   - "category": Contextual thematic category (e.g. Greetings, Food, Family, Travel, Actions, Work).
   - "exampleTarget": A natural, realistic 1-sentence example in the target language using the target word.
   - "exampleEnglish": Accurate English translation of the example sentence.
   - "notes": Concise mnemonic tip, memory hook, or grammatical usage note.
${
  isFirstChunk
    ? `5. Also provide deck metadata: "detectedLanguage", "languageCode" (BCP 47, e.g. "ar-SA", "es-ES", "ja-JP", "fr-FR", "de-DE"), "deckTitle" ("${deckTitle || ''}" or curated title), "deckDescription", "color" ("blue"|"indigo"|"purple"|"green"|"orange"|"pink"|"teal"), and "icon" ("Sparkles"|"Compass"|"Coffee"|"BookOpen"|"Globe"|"Heart").`
    : ''
}`;

  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ...(isFirstChunk
                ? {
                    detectedLanguage: { type: Type.STRING },
                    languageCode: { type: Type.STRING },
                    deckTitle: { type: Type.STRING },
                    deckDescription: { type: Type.STRING },
                    color: { type: Type.STRING },
                    icon: { type: Type.STRING },
                  }
                : {}),
              cards: {
                type: Type.ARRAY,
                description: `Array of EXACTLY ${expectedCount} enriched flashcards`,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    english: { type: Type.STRING },
                    targetWord: { type: Type.STRING },
                    phonetic: { type: Type.STRING },
                    partOfSpeech: { type: Type.STRING },
                    category: { type: Type.STRING },
                    exampleTarget: { type: Type.STRING },
                    exampleEnglish: { type: Type.STRING },
                    notes: { type: Type.STRING },
                  },
                  required: ['english', 'targetWord', 'category'],
                },
              },
            },
            required: ['cards'],
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
            partOfSpeech: orig.partOfSpeech || aiCard?.partOfSpeech || (orig.targetWord.includes(' ') ? 'phrase' : 'word'),
            category: orig.category || aiCard?.category || 'Core Vocabulary',
            exampleTarget: aiCard?.exampleTarget || orig.targetWord,
            exampleEnglish: aiCard?.exampleEnglish || orig.english,
            notes: orig.notes || aiCard?.notes || `Vocabulary item #${chunkIndex * 16 + idx + 1}`,
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

  // Graceful chunk fallback if model fails for this batch: retain all input items without dropping any
  return {
    cards: chunk.map((orig, idx) => ({
      english: orig.english,
      targetWord: orig.targetWord,
      phonetic: orig.phonetic || '',
      partOfSpeech: orig.partOfSpeech || (orig.targetWord.includes(' ') ? 'phrase' : 'word'),
      category: orig.category || 'Core Vocabulary',
      exampleTarget: orig.targetWord,
      exampleEnglish: orig.english,
      notes: orig.notes || `Vocabulary item #${chunkIndex * 16 + idx + 1}`,
    })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { words, deckTitle, targetLanguage } = body as {
      words: TableRowInput[];
      deckTitle?: string;
      targetLanguage?: string;
    };

    if (!words || !Array.isArray(words) || words.length === 0) {
      return NextResponse.json({ error: 'No words provided' }, { status: 400 });
    }

    const ai = getAiClient();
    const langInfo = inferLanguageDetails(words, targetLanguage);

    // Fallback if no API key is provided: return local smart deck with ALL items
    if (!ai) {
      return NextResponse.json(generateLocalSmartDeck(words, deckTitle, targetLanguage));
    }

    // BATCHING / CHUNKING LOGIC: Process cards in chunks of 16 (15-20 range)
    // to prevent hitting output token limits or model truncation.
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
      const found = allEnrichedCards[idx] || allEnrichedCards.find(
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
        partOfSpeech: orig.partOfSpeech || (orig.targetWord.includes(' ') ? 'phrase' : 'word'),
        category: orig.category || 'Core Vocabulary',
        exampleTarget: orig.targetWord,
        exampleEnglish: orig.english,
        notes: orig.notes || `Vocabulary item #${idx + 1}`,
      };
    });

    const firstMeta = batchResults[0]?.meta;
    const cleanLanguage = firstMeta?.detectedLanguage || langInfo.language;

    return NextResponse.json({
      fallback: false,
      detectedLanguage: cleanLanguage,
      languageCode: firstMeta?.languageCode || langInfo.languageCode,
      deckTitle: firstMeta?.deckTitle || deckTitle?.trim() || `${cleanLanguage} Smart Deck`,
      deckDescription:
        firstMeta?.deckDescription ||
        `Smart spaced repetition deck with ${verifiedCards.length} vocabulary words enriched with pronunciation and context.`,
      color: firstMeta?.color || langInfo.color,
      icon: firstMeta?.icon || langInfo.icon,
      cards: verifiedCards,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.warn('Handling request error with local fallback:', errMsg.slice(0, 100));
    // Safe graceful return with ALL words retained so user is never blocked
    const body = await req.json().catch(() => ({}));
    const fallbackWords = Array.isArray(body?.words) ? body.words : [];
    return NextResponse.json(
      generateLocalSmartDeck(fallbackWords, body?.deckTitle, body?.targetLanguage)
    );
  }
}
