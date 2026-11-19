import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSpeechLanguageCode,
  parseLanguageHint,
  extractSpeakableText,
  selectBestBrowserVoice,
  getLanguageDisplayName,
} from './speech-utils.ts';

describe('parseLanguageHint', () => {
  it('does NOT misclassify Japanese, Chinese, Portuguese, Vietnamese, or Indonesian as Spanish (es-ES)', () => {
    assert.equal(parseLanguageHint('Japanese'), 'ja-JP');
    assert.equal(parseLanguageHint('Chinese'), 'zh-CN');
    assert.equal(parseLanguageHint('Portuguese'), 'pt-BR');
    assert.equal(parseLanguageHint('Vietnamese'), 'vi-VN');
    assert.equal(parseLanguageHint('Indonesian'), 'id-ID');
    assert.equal(parseLanguageHint('Cantonese'), 'zh-HK');
  });

  it('does NOT misclassify Mandarin or Hungarian as Arabic (ar-SA)', () => {
    assert.equal(parseLanguageHint('Mandarin'), 'zh-CN');
    assert.equal(parseLanguageHint('Hungarian'), 'hu-HU');
  });

  it('handles BCP-47 tags and composite language names accurately', () => {
    assert.equal(parseLanguageHint('ar-SA'), 'ar-SA');
    assert.equal(parseLanguageHint('ar-EG'), 'ar-EG');
    assert.equal(parseLanguageHint('Levantine Arabic'), 'ar-SA');
    assert.equal(parseLanguageHint('Japanese (JLPT N5)'), 'ja-JP');
    assert.equal(parseLanguageHint('Spanish'), 'es-ES');
    assert.equal(parseLanguageHint('Hindi'), 'hi-IN');
    assert.equal(parseLanguageHint('Urdu'), 'ur-PK');
    assert.equal(parseLanguageHint('Persian'), 'fa-IR');
    assert.equal(parseLanguageHint('Farsi'), 'fa-IR');
    assert.equal(parseLanguageHint('Turkish'), 'tr-TR');
    assert.equal(parseLanguageHint('Hebrew'), 'he-IL');
    assert.equal(parseLanguageHint('Greek'), 'el-GR');
    assert.equal(parseLanguageHint('Korean'), 'ko-KR');
    assert.equal(parseLanguageHint('Foreign Language'), null);
  });
});

describe('resolveSpeechLanguageCode', () => {
  it('overrides stale default es-ES when actual card text is in Arabic, Japanese, Korean, Russian, Hindi, Hebrew, Greek, or Thai', () => {
    assert.equal(resolveSpeechLanguageCode('es-ES', 'أهلاً وسهلاً'), 'ar-SA');
    assert.equal(resolveSpeechLanguageCode('es-ES', 'こんにちは'), 'ja-JP');
    assert.equal(resolveSpeechLanguageCode('es-ES', '안녕하세요'), 'ko-KR');
    assert.equal(resolveSpeechLanguageCode('es-ES', 'Привет'), 'ru-RU');
    assert.equal(resolveSpeechLanguageCode('es-ES', 'नमस्ते'), 'hi-IN');
    assert.equal(resolveSpeechLanguageCode('es-ES', 'שלום'), 'he-IL');
    assert.equal(resolveSpeechLanguageCode('es-ES', 'Γειά σου'), 'el-GR');
    assert.equal(resolveSpeechLanguageCode('es-ES', 'สวัสดี'), 'th-TH');
  });

  it('preserves Urdu, Persian, and Kanji-only Japanese hints even when primary code is stale es-ES', () => {
    assert.equal(resolveSpeechLanguageCode('Urdu', 'شکریہ'), 'ur-PK');
    assert.equal(resolveSpeechLanguageCode('es-ES', 'شکریہ', 'Urdu'), 'ur-PK');
    assert.equal(resolveSpeechLanguageCode('Persian', 'سلام'), 'fa-IR');
    assert.equal(resolveSpeechLanguageCode('es-ES', 'سلام', 'Persian'), 'fa-IR');
    assert.equal(resolveSpeechLanguageCode('Japanese', '水 (Mizu)'), 'ja-JP');
    assert.equal(resolveSpeechLanguageCode('es-ES', '水', 'Japanese'), 'ja-JP');
  });

  it('uses explicit hint for Latin-script languages', () => {
    assert.equal(resolveSpeechLanguageCode('French', 'Bonjour'), 'fr-FR');
    assert.equal(resolveSpeechLanguageCode('German', 'Guten Tag'), 'de-DE');
    assert.equal(resolveSpeechLanguageCode('Italian', 'Buongiorno'), 'it-IT');
    assert.equal(resolveSpeechLanguageCode('Spanish', 'Hola'), 'es-ES');
    assert.equal(resolveSpeechLanguageCode('Turkish', 'Merhaba'), 'tr-TR');
  });

  it('infers language from diacritics when hint is generic or missing', () => {
    assert.equal(resolveSpeechLanguageCode('Foreign Language', '¿Dónde está el baño?'), 'es-ES');
    assert.equal(resolveSpeechLanguageCode('', 'Straße'), 'de-DE');
    assert.equal(resolveSpeechLanguageCode(undefined, 'Cảm ơn'), 'vi-VN');
  });
});

describe('extractSpeakableText', () => {
  it('strips parenthesized romaji when native script is present', () => {
    assert.equal(extractSpeakableText('水 (Mizu)'), '水');
    assert.equal(extractSpeakableText('美味しい (Oishii)'), '美味しい');
    assert.equal(extractSpeakableText('さようなら (Sayounara)'), 'さようなら');
  });

  it('deduplicates Arabic diacritic slash variants and removes tatweel suffix dash', () => {
    assert.equal(extractSpeakableText('مَرحَباً / مَرحَبَاً'), 'مَرحَباً');
    assert.equal(extractSpeakableText('ـكَ'), 'كَ');
    assert.equal(extractSpeakableText('طالِب / طالبة'), 'طالِب, طالبة');
  });

  it('strips gender icons and bare ellipsis placeholders cleanly', () => {
    assert.equal(extractSpeakableText('How are you? (♂)'), 'How are you?');
    assert.equal(extractSpeakableText('اِسمي ...'), 'اِسمي');
  });
});

describe('selectBestBrowserVoice', () => {
  const sampleVoices = [
    { name: 'Google US English', lang: 'en-US', localService: false, default: true },
    { name: 'espeak Spanish', lang: 'es-ES', localService: true },
    { name: 'Google español', lang: 'es-ES', localService: false },
    { name: 'Microsoft Elena Natural', lang: 'es-AR', localService: false },
    { name: 'Kyoko', lang: 'ja-JP', localService: true },
  ];

  it('returns null when no browser voice supports the target language (e.g. Arabic)', () => {
    assert.equal(selectBestBrowserVoice(sampleVoices, 'ar-SA'), null);
    assert.equal(selectBestBrowserVoice([], 'es-ES'), null);
  });

  it('prefers higher quality voices over espeak and breaks ties by exact locale', () => {
    const esVoice = selectBestBrowserVoice(sampleVoices, 'es-ES');
    assert.ok(esVoice);
    assert.notEqual(esVoice.name, 'espeak Spanish');
    assert.equal(esVoice.name, 'Microsoft Elena Natural');

    const exactLocaleTie = selectBestBrowserVoice(
      [
        { name: 'Google español de Estados Unidos', lang: 'es-US', localService: false },
        { name: 'Google español', lang: 'es-ES', localService: false },
      ],
      'es-ES'
    );
    assert.ok(exactLocaleTie);
    assert.equal(exactLocaleTie.name, 'Google español');

    const jaVoice = selectBestBrowserVoice(sampleVoices, 'ja-JP');
    assert.ok(jaVoice);
    assert.equal(jaVoice.name, 'Kyoko');
  });
});

describe('getLanguageDisplayName', () => {
  it('returns readable language names for BCP-47 codes', () => {
    assert.equal(getLanguageDisplayName('ar-SA'), 'Arabic');
    assert.equal(getLanguageDisplayName('ja-JP'), 'Japanese');
    assert.equal(getLanguageDisplayName('es-MX'), 'Spanish');
    assert.equal(getLanguageDisplayName('ur-PK'), 'Urdu');
  });
});
