import { Deck, Flashcard } from './types';

export const INITIAL_DECKS: Deck[] = [
  {
    id: 'deck-spanish-core',
    title: 'Spanish Essentials',
    language: 'Spanish',
    languageCode: 'es-ES',
    color: 'blue',
    description: 'High-frequency conversational vocabulary and phrases for everyday travel and connection.',
    icon: 'Sparkles',
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: 'deck-japanese-travel',
    title: 'Japanese Daily Life',
    language: 'Japanese',
    languageCode: 'ja-JP',
    color: 'pink',
    description: 'Essential polite phrases, ordering food, and navigating Tokyo and Kyoto.',
    icon: 'Compass',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'deck-french-cafe',
    title: 'French Café & Dining',
    language: 'French',
    languageCode: 'fr-FR',
    color: 'indigo',
    description: 'Atmospheric words for ordering pastries, coffee, and polite conversations in Paris.',
    icon: 'Coffee',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

const now = new Date();

export const INITIAL_CARDS: Flashcard[] = [
  // Spanish Deck
  {
    id: 'card-es-1',
    deckId: 'deck-spanish-core',
    english: 'Hello / Hi',
    targetWord: 'Hola',
    language: 'Spanish',
    phonetic: 'OH-lah',
    partOfSpeech: 'interjection',
    category: 'Greetings',
    exampleSentence: {
      target: '¡Hola! ¿Cómo estás hoy?',
      english: 'Hello! How are you today?',
    },
    notes: 'Used at any time of day in casual or polite contexts.',
    state: 'review',
    repetitions: 3,
    intervalDays: 3,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime() - 1000).toISOString(), // Due now
  },
  {
    id: 'card-es-2',
    deckId: 'deck-spanish-core',
    english: 'Thank you very much',
    targetWord: 'Muchas gracias',
    language: 'Spanish',
    phonetic: 'MOO-chahs GRAH-syahs',
    partOfSpeech: 'phrase',
    category: 'Courtesy',
    exampleSentence: {
      target: 'Muchas gracias por su amable ayuda.',
      english: 'Thank you very much for your kind help.',
    },
    notes: 'Universal expression of sincere gratitude.',
    state: 'review',
    repetitions: 2,
    intervalDays: 1,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime() - 5000).toISOString(), // Due now
  },
  {
    id: 'card-es-3',
    deckId: 'deck-spanish-core',
    english: 'Please',
    targetWord: 'Por favor',
    language: 'Spanish',
    phonetic: 'por fah-VOR',
    partOfSpeech: 'phrase',
    category: 'Courtesy',
    exampleSentence: {
      target: 'Un café con leche, por favor.',
      english: 'A coffee with milk, please.',
    },
    notes: 'Essential for ordering food and asking favors.',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime()).toISOString(),
  },
  {
    id: 'card-es-4',
    deckId: 'deck-spanish-core',
    english: 'Where is the bathroom?',
    targetWord: '¿Dónde está el baño?',
    language: 'Spanish',
    phonetic: 'DON-deh eh-STAH el BAHN-yoh',
    partOfSpeech: 'question',
    category: 'Travel & Needs',
    exampleSentence: {
      target: 'Disculpe, ¿dónde está el baño?',
      english: 'Excuse me, where is the bathroom?',
    },
    notes: 'One of the most practical questions when exploring.',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime() + 60000).toISOString(),
  },
  {
    id: 'card-es-5',
    deckId: 'deck-spanish-core',
    english: 'The bill / check',
    targetWord: 'La cuenta',
    language: 'Spanish',
    phonetic: 'lah KWEN-tah',
    partOfSpeech: 'noun',
    category: 'Dining',
    exampleSentence: {
      target: '¿Nos trae la cuenta, por favor?',
      english: 'Could you bring us the bill, please?',
    },
    notes: 'Feminine noun.',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime() + 120000).toISOString(),
  },

  // Japanese Deck
  {
    id: 'card-ja-1',
    deckId: 'deck-japanese-travel',
    english: 'Good afternoon / Hello',
    targetWord: 'こんにちは (Konnichiwa)',
    language: 'Japanese',
    phonetic: 'kon-nee-chee-wah',
    partOfSpeech: 'greeting',
    category: 'Greetings',
    exampleSentence: {
      target: 'みなさん、こんにちは！',
      english: 'Hello everyone!',
    },
    notes: 'Written with "ha" (は) at the end pronounced "wa".',
    state: 'review',
    repetitions: 1,
    intervalDays: 1,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime() - 2000).toISOString(),
  },
  {
    id: 'card-ja-2',
    deckId: 'deck-japanese-travel',
    english: 'Thank you (polite)',
    targetWord: 'ありがとうございます (Arigatou gozaimasu)',
    language: 'Japanese',
    phonetic: 'ah-ree-gah-toh go-zah-ee-mahs',
    partOfSpeech: 'phrase',
    category: 'Politeness',
    exampleSentence: {
      target: '丁寧なご案内をありがとうございます。',
      english: 'Thank you very much for your detailed guidance.',
    },
    notes: 'Use with strangers, shopkeepers, and elders.',
    state: 'review',
    repetitions: 2,
    intervalDays: 2,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime() - 8000).toISOString(),
  },
  {
    id: 'card-ja-3',
    deckId: 'deck-japanese-travel',
    english: 'Excuse me / I am sorry',
    targetWord: 'すみません (Sumimasen)',
    language: 'Japanese',
    phonetic: 'soo-mee-mah-sen',
    partOfSpeech: 'phrase',
    category: 'Politeness',
    exampleSentence: {
      target: 'すみません、お会計をお願いします。',
      english: 'Excuse me, check please.',
    },
    notes: 'The golden word in Japan: used to get attention, say sorry, and thank someone.',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime() + 30000).toISOString(),
  },
  {
    id: 'card-ja-4',
    deckId: 'deck-japanese-travel',
    english: 'Delicious',
    targetWord: '美味しい (Oishii)',
    language: 'Japanese',
    phonetic: 'oh-ee-shee',
    partOfSpeech: 'i-adjective',
    category: 'Food',
    exampleSentence: {
      target: 'このラーメンは本当に美味しいです！',
      english: 'This ramen is really delicious!',
    },
    notes: 'Compliment the chef by saying this warmly.',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime() + 90000).toISOString(),
  },

  // French Deck
  {
    id: 'card-fr-1',
    deckId: 'deck-french-cafe',
    english: 'Good morning / Hello',
    targetWord: 'Bonjour',
    language: 'French',
    phonetic: 'bohn-ZHOOR',
    partOfSpeech: 'greeting',
    category: 'Courtesy',
    exampleSentence: {
      target: 'Bonjour madame, comment allez-vous ?',
      english: 'Good morning madam, how are you?',
    },
    notes: 'Always say "Bonjour" when walking into any French shop or boulangerie.',
    state: 'review',
    repetitions: 2,
    intervalDays: 2,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime() - 500).toISOString(),
  },
  {
    id: 'card-fr-2',
    deckId: 'deck-french-cafe',
    english: 'A croissant, please',
    targetWord: 'Un croissant, s’il vous plaît',
    language: 'French',
    phonetic: 'uhn krwah-SAHN, seel voo PLEH',
    partOfSpeech: 'phrase',
    category: 'Café',
    exampleSentence: {
      target: 'Un café noir et un croissant, s’il vous plaît.',
      english: 'A black coffee and a croissant, please.',
    },
    notes: '"S’il vous plaît" is polite/formal.',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: new Date(now.getTime() + 60000).toISOString(),
  },
];

export const SAMPLE_TABLE_PRESETS = [
  {
    name: 'Arabic Multi-Topic Master (81 Words)',
    language: 'Arabic',
    code: 'ar-SA',
    rawText: `1. Greetings & Introductions
English\tArabic Script\tTransliteration\tNotes
Welcome\tأهلاً وسهلاً\t'ahlan wa sahlan\t
Hello\tمَرحَباً / مَرحَبَاً\tmarHaba / marHaban\t
Good morning\tصَباح الخَير\tSabaaH al-khayr\t
Response: Good morning\tصَباح النّور\tSabaaH an-nuur\t
Peace be upon you\tالسَّلامُ عَلَيكُم\tassalaamu Calaykum\t
Response: And upon you peace\tوَعَلَيكُمُ السَّلام\twa Calaykumu s-salaam\t
How are you?\tكَيفَ الحال؟\tkayfa al-Haal?\tFormal / General
Response: Praise be to God\tالحَمدُ لله\tal-Hamdulillaah\t
My name is X\tاِسمي ...\tismii X\t
I’m from the city of X in X country\tأَنا مِن مَدينة ... في ...\tanaa min madiinat X fii X\t
Good afternoon / evening\tمَساء الخَير\tmasaa’ al-khayr\tResponse: masaa' an-nuur
How are you? (♂)\tكَيفَ حالُكَ؟\tkayfa Haaluka?\tFormal masculine
How are you? (♀)\tكَيفَ حالُكِ؟\tkayfa Haaluki?\tFormal feminine
Response: Fine / well\tبِخَير\tbi-khayr\t
Nice to meet you\tتَشَرَّفنا\ttasharrafnaa\t

2. Dialect vs. Formal Expressions & Question Words
Meaning\tArabic Script\tTransliteration\tGender / Dialect Notes
Good morning\tصباح الخير\tSabaaH el-kheer / al-khayr\tDialect / Formal variation
Good morning (response)\tصباح النور\tSabaaH in-nuur / an-nuur\tDialect / Formal variation
How are you?\tكيفك\tkiifak\tDialect (♂)
How are you?\tكيفك\tkiifik\tDialect (♀)
Good / fine\tكويس\tkwayyis\tDialect (♂)
Good / fine\tكويسة\tkwayysa/e\tDialect (♀)
Fine / okay\tتمام\ttamaam\tNeutral (♂ / ♀)
Fine / good\tمنيح\tmniiH\tLevantine dialect (♂)
Fine / good\tمنيحة\tmniiHa\tLevantine dialect (♀)
Not good\tمش كويس\tmish kwayyis\tDialect (♂)
What’s your name?\tما اسمك؟\tmaa ismuka?\tFormal (♂)
What’s your name?\tما اسمكِ؟\tmaa ismuki?\tFormal (♀)
What’s your name?\tشو اسمك؟\tshuu ismak? / ismik?\tDialect (♂ / ♀)
Your presence / form of address\tحضرتك\tHaDratuka / -ki\tFormal polite address (♂ / ♀)
Welcome\tأهلاً بك\tahlan bika / -ki\t(♂ / ♀)
Nice to meet you\tتشرفنا بك\ttasharrafnaa bika / -ki\t(♂ / ♀)
Where? (New)\tوين؟\tween?\tDialect question word
From where? (New)\tمن وين؟\tmin ween?\tDialect question phrase
What? (New)\tشو؟\tshuu?\tDialect question word

3. Classroom, Objects & Places Vocabulary
English\tArabic Script\tTransliteration\tGender / Number
Book\tكِتاب\tkitaab\tMasculine
Notebook\tدَفتَر\tdaftar\tMasculine
Pen / pencil\tقَلَم\tqalam\tMasculine
Chair\tكُرسِيّ\tkursii\tMasculine
Table\tطاوِلة\tTaawila(t)\tFeminine
Light\tنور\tnuur\tMasculine
Paper\tوَرَقة\twaraqa(t)\tFeminine
Page\tصَفحة\tSafHa(t)\tFeminine
Question\tسُؤال\tsu’aal\tMasculine
Board\tلَوح\tlawH\tMasculine
Office / desk\tمَكتَب\tmaktab\tMasculine
Student\tطالِب / طالبة\tTaalib / Taaliba(t)\t♂ / ♀
Teacher / Professor\tأُستاذ / أُستاذة\tustaadh / ustaadha(t)\t♂ / ♀
Problem\tمُشكِلة\tmushkila(t)\tFeminine
Homework (singular)\tواجِب\twaajib\tMasculine
Homework (plural) (New)\tواجِبات\twaajibaat\tPlural
Window\tشُبّاك\tshubbaak\tMasculine
Classroom / class\tصَفّ\tSaff\tMasculine
Door\tباب\tbaab\tMasculine
Drill / exercise\tتَمرين\ttamriin\tMasculine
House / home (New)\tبَيت\tbayt\tMasculine
Street (New)\tشارِع\tshaaric\tMasculine
Bed (New)\tتَخت\ttakht\tMasculine
University (New)\tجامِعة\tjaamica(t)\tFeminine
News item (singular) (New)\tخَبَر\tkhabar\tMasculine
News (plural / general) (New)\tأَخبار\takhbaar\tPlural

4. Prepositions & Spatial Words (New from Week 4)
English\tArabic Script\tTransliteration\tNotes
Under / beneath\tتَحتَ\ttaHta\tPreposition
On / upon\tعَلى\tCalaa\tPreposition
Between / among\tبَينَ\tbayna\tPreposition
In / at\tفي\tfii\tPreposition (reviewed)
From\tمِن\tmin\tPreposition (reviewed)

5. Pronouns & Demonstratives (New from Week 4)
English\tArabic Script\tTransliteration\tType / Notes
I\tأَنا\tanaa\t1st person singular
You (masculine)\tأَنتَ\tanta\t2nd person singular (♂)
You (feminine)\tأَنتِ\tanti\t2nd person singular (♀)
He / it\tهُوَ\thuwa\t3rd person singular (♂)
She / it\tهِيَ\thiya\t3rd person singular (♀)
This is (masculine)\tهذا\thaadhaa\tDemonstrative pronoun (♂)
This is (feminine)\tهذِهِ\thaadhihi\tDemonstrative pronoun (♀)

6. People & Relationships (New from Week 4)
English\tArabic Script\tTransliteration\tGender
Neighbor (♂)\tجار\tjaar\tMasculine
Neighbor (♀)\tجارة\tjaara(t)\tFeminine
Friend / companion (♂)\tصاحِب\tSaaHib\tMasculine
Beloved / lover / sweetheart (♂)\tحَبيب\tHabiib\tMasculine

7. Possessive Suffixes / Attached Pronouns (New from Week 4)
Suffix\tTransliteration\tMeaning\tExample: kitaab (book)\tExample: jaara(t) (neighbor ♀)
ـي\t-ii\tMy\tكِتابي (kitaabii - my book)\tجاراتي (jaaratii - my neighbor)
ـكَ\t-ka\tYour (♂)\tكِتابُكَ (kitaabuka - your book)\tجارَتُكَ (jaaratuka - your neighbor)
ـكِ\t-ki\tYour (♀)\tكِتابُكِ (kitaabuki - your book)\tجارَتُكِ (jaaratuki - your neighbor)
ـهُ\t-hu\tHis\tكِتابُهُ (kitaabuhu - his book)\tجارَتُهُ (jaaratuhu - his neighbor)
ـها\t-haa\tHer\tكِتابُها (kitaabuhaa - her book)\tجارَتُها (jaaratuhaa - her neighbor)`,
  },
  {
    name: 'Spanish Travel & Social (10 Words)',
    language: 'Spanish',
    code: 'es-ES',
    rawText: `English\tSpanish\nHello\tHola\nGood morning\tBuenos días\nThank you\tGracias\nPlease\tPor favor\nExcuse me\tDisculpe\nWater\tAgua\nFood\tComida\nTrain station\tEstación de tren\nHow much is it?\t¿Cuánto cuesta?\nGoodbye\tAdiós`,
  },
  {
    name: 'Japanese Core Words (10 Words)',
    language: 'Japanese',
    code: 'ja-JP',
    rawText: `English\tJapanese\nHello\tこんにちは\nThank you\tありがとう\nYes\tはい\nNo\tいいえ\nWater\t水 (Mizu)\nDelicious\t美味しい (Oishii)\nWhere?\tどこ (Doko)\nTrain\t電車 (Densha)\nFriend\t友達 (Tomodachi)\nGoodbye\tさようなら (Sayounara)`,
  },
  {
    name: 'German Everyday Basics (10 Words)',
    language: 'German',
    code: 'de-DE',
    rawText: `English\tGerman\nHello\tHallo\nGood evening\tGuten Abend\nThank you\tDanke schön\nPlease / You're welcome\tBitte\nExcuse me\tEntschuldigung\nCoffee\tKaffee\nBread\tBrot\nWhere is...\tWo ist...\nGoodbye\tAuf Wiedersehen\nSee you soon\tBis bald`,
  },
  {
    name: 'Italian Gelato & City Life (10 Words)',
    language: 'Italian',
    code: 'it-IT',
    rawText: `English\tItalian\nHello / Bye\tCiao\nGood morning\tBuongiorno\nThank you\tGrazie\nPlease\tPer favore\nCoffee\tCaffè\nIce cream\tGelato\nBeautiful\tBellissimo\nWhere is...\tDov'è...\nCheck please\nIl conto, per favore\nGoodnight\tBuonanotte`,
  },
];
