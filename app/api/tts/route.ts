import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  extractSpeakableText,
  getLanguageDisplayName,
  resolveSpeechLanguageCode,
} from '@/lib/speech-utils';

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

// Lightweight in-memory server LRU cache for generated pronunciation clips
const MAX_CACHE_ENTRIES = 250;
const audioCache = new Map<string, { buffer: Uint8Array; mimeType: string }>();

function getCachedAudio(key: string): { buffer: Uint8Array; mimeType: string } | undefined {
  const entry = audioCache.get(key);
  if (!entry) return undefined;
  // Refresh LRU order
  audioCache.delete(key);
  audioCache.set(key, entry);
  return entry;
}

function setCachedAudio(key: string, buffer: Uint8Array, mimeType: string) {
  if (audioCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = audioCache.keys().next().value;
    if (oldestKey) audioCache.delete(oldestKey);
  }
  audioCache.set(key, { buffer, mimeType });
}

function wrapRawPcmInWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function isRiffWav(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf[0] === 0x52 && // R
    buf[1] === 0x49 && // I
    buf[2] === 0x46 && // F
    buf[3] === 0x46 // F
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      text?: unknown;
      languageCode?: unknown;
      language?: unknown;
    } | null;

    const rawText = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!rawText) {
      return NextResponse.json({ error: 'Text is required for speech synthesis.' }, { status: 400 });
    }

    const speakableText = extractSpeakableText(rawText).slice(0, 280);
    if (!speakableText) {
      return NextResponse.json({ error: 'No speakable text provided.' }, { status: 400 });
    }

    const hintCode = typeof body?.languageCode === 'string' ? body.languageCode : undefined;
    const hintLang = typeof body?.language === 'string' ? body.language : undefined;
    const targetLang = resolveSpeechLanguageCode(hintCode, speakableText, hintLang);
    const languageName = getLanguageDisplayName(targetLang, hintLang);

    const cacheKey = `${targetLang}::${speakableText}`;
    const cached = getCachedAudio(cacheKey);
    if (cached) {
      return new NextResponse(Buffer.from(cached.buffer), {
        status: 200,
        headers: {
          'Content-Type': cached.mimeType,
          'Cache-Control': 'public, max-age=86400',
          'X-TTS-Cache': 'HIT',
          'X-TTS-Lang': targetLang,
        },
      });
    }

    const ai = getAiClient();
    if (!ai) {
      return NextResponse.json(
        { error: 'Speech synthesis service is not configured.' },
        { status: 503 }
      );
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: speakableText,
              speechMetadata: {
                style: `Clear, natural native ${languageName} pronunciation at a slightly measured learning pace`,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find((p) => p.inlineData?.data);
    const base64Audio = audioPart?.inlineData?.data;

    if (!base64Audio) {
      return NextResponse.json(
        { error: 'No audio was returned by speech synthesis.' },
        { status: 502 }
      );
    }

    let audioBuffer: Buffer = Buffer.from(base64Audio, 'base64');
    let mimeType = audioPart?.inlineData?.mimeType || 'audio/wav';

    // Unary gemini-3.8-flash-lite-tts returns a complete RIFF WAV file;
    // defensively wrap if a raw PCM mime type is ever returned without a WAV header.
    if (!isRiffWav(audioBuffer) && /l16|pcm/i.test(mimeType)) {
      audioBuffer = wrapRawPcmInWav(audioBuffer);
      mimeType = 'audio/wav';
    } else if (isRiffWav(audioBuffer)) {
      mimeType = 'audio/wav';
    }

    const bytes = new Uint8Array(audioBuffer);
    setCachedAudio(cacheKey, bytes, mimeType);

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400',
        'X-TTS-Cache': 'MISS',
        'X-TTS-Lang': targetLang,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'TTS request failed';
    console.warn('TTS API route error:', message.slice(0, 160));
    return NextResponse.json(
      { error: 'Unable to synthesize speech right now.' },
      { status: 502 }
    );
  }
}
