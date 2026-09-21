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
    if (l.includes('portug')) {
      return { language: 'Portuguese', languageCode: 'pt-BR', color: 'teal', icon: 'Globe' };
    }
    if (l.includes('russ')) {
      return { language: 'Russian', languageCode: 'ru-RU', color: 'blue', icon: 'BookOpen' };
    }
    return { language: userLang, languageCode: 'en-US', color: 'blue', icon: 'BookOpen' };
  }

  const sample = words.map((w) => `${w.targetWord} ${w.english}`).join(' ');

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

    // Fallback if no API key is provided
    if (!ai) {
      return NextResponse.json(generateLocalSmartDeck(words, deckTitle, targetLanguage));
    }

    const prompt = `You are an expert language teacher and polyglot cognitive scientist.
I have a list of vocabulary words (English translation paired with the target language word):

${JSON.stringify(words, null, 2)}

User specified title (optional): "${deckTitle || ''}"
User specified language (optional): "${targetLanguage || ''}"

TASK:
1. Identify the foreign language and standard IETF BCP 47 code (e.g., "es-ES", "ja-JP", "fr-FR", "de-DE", "it-IT", "zh-CN", "ko-KR").
2. Create a smart deck title and short description in the style of Apple design.
3. For each word/phrase:
   - Provide accurate phonetic transcription or pronunciation guide (e.g. IPA or friendly Romanization like Romaji/Pinyin).
   - Identify part of speech (noun, verb, adjective, phrase, etc.).
   - Craft a natural, realistic 1-sentence example in the target language with its English translation to anchor context.
   - Add a concise learning note or mnemonic memory hook.
   - Tag the appropriate thematic category (e.g., "Greetings", "Travel & Transit", "Food & Drink", "Verbs", "Social").
4. Pick an Apple system color theme ("blue" | "indigo" | "purple" | "green" | "orange" | "pink" | "teal") and an Apple Lucide icon name ("Sparkles" | "Coffee" | "Compass" | "BookOpen" | "Heart" | "Flame" | "Globe").`;

    // Multi-model resilience: try primary fast model, then fallbacks if experiencing 503 or resource limits
    const CANDIDATE_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
    let generatedData: any = null;

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
                detectedLanguage: {
                  type: Type.STRING,
                  description: 'Name of the target language (e.g. Spanish, Japanese, French)',
                },
                languageCode: {
                  type: Type.STRING,
                  description: 'Standard BCP 47 code (e.g. es-ES, ja-JP, fr-FR, de-DE)',
                },
                deckTitle: {
                  type: Type.STRING,
                  description: 'Smart curated title for this deck',
                },
                deckDescription: {
                  type: Type.STRING,
                  description: 'Short 1-sentence description',
                },
                color: {
                  type: Type.STRING,
                  description: 'Apple theme color: blue, indigo, purple, green, orange, pink, or teal',
                },
                icon: {
                  type: Type.STRING,
                  description: 'Lucide icon name, e.g. Sparkles, Compass, Coffee, BookOpen, Globe',
                },
                cards: {
                  type: Type.ARRAY,
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
              required: ['detectedLanguage', 'languageCode', 'deckTitle', 'cards'],
            },
          },
        });

        if (response.text) {
          generatedData = JSON.parse(response.text);
          break;
        }
      } catch (modelErr: unknown) {
        // Log as warning and cascade gracefully to alternative candidate
        const errMsg = modelErr instanceof Error ? modelErr.message : String(modelErr);
        console.warn(`Model ${model} unavailable (${errMsg.slice(0, 80)}...), trying next fallback.`);
      }
    }

    if (generatedData && Array.isArray(generatedData.cards) && generatedData.cards.length > 0) {
      return NextResponse.json(generatedData);
    }

    // If all models hit capacity/demand limits, return intelligent local generation without failing
    const localDeck = generateLocalSmartDeck(words, deckTitle, targetLanguage);
    return NextResponse.json(localDeck);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.warn('Handling request error with local fallback:', errMsg.slice(0, 100));
    // Safe graceful return so user is never faced with an unhandled 500 error
    return NextResponse.json(
      generateLocalSmartDeck([], 'Custom Vocabulary', 'Foreign Language')
    );
  }
}
