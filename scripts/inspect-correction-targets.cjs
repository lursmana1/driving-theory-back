require('dotenv').config();
const { MongoClient } = require('mongodb');

const PLACEHOLDER_EXPLANATION_PREFIX = 'განმარტება მალე დაემატება';
const PLACEHOLDER_EXPLANATION_KEYWORD = 'იხილე კანონი საგზაო მოძრაობის შესახებ';

const hasText = (v) => typeof v === 'string' && v.trim().length > 0;
const isPlaceholder = (t) => {
  if (!t) return true;
  const n = String(t).trim().toLowerCase();
  return (
    n.includes(PLACEHOLDER_EXPLANATION_PREFIX.toLowerCase()) ||
    n.includes(PLACEHOLDER_EXPLANATION_KEYWORD.toLowerCase())
  );
};
const containsGeorgian = (t) => !!t && /[ა-ჰ]/.test(t);
const containsCyrillic = (t) => !!t && /[А-Яа-яЁё]/.test(t);
const containsLatin = (t) => !!t && /[A-Za-z]/.test(t);
const preview = (s, n = 120) =>
  !s ? '(empty)' : String(s).replace(/\s+/g, ' ').slice(0, n);

(async () => {
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  try {
    const coll = c.db(process.env.MONGODB_DB).collection('questions');
    const rows = await coll
      .find(
        { lang: { $in: ['ka', 'ru', 'en'] }, id: { $exists: true } },
        {
          projection: {
            _id: 0,
            id: 1,
            lang: 1,
            question: 1,
            question_explained: 1,
            ai_tutor: 1,
          },
        },
      )
      .toArray();

    const byId = new Map();
    for (const r of rows) {
      const rec = byId.get(r.id) ?? {};
      rec[r.lang] = r;
      byId.set(r.id, rec);
    }

    const correctionTargets = [];
    const missingKaOnly = [];

    for (const [id, rec] of byId) {
      const { ka, ru, en } = rec;
      if (!ka && ru && en) {
        missingKaOnly.push({ id, ru, en });
        continue;
      }
      if (!(ka && ru && en)) continue;

      const issues = [];
      if (!hasText(ru.question)) issues.push('ru_question_empty');
      if (!hasText(en.question)) issues.push('en_question_empty');
      if (isPlaceholder(ka.question_explained)) issues.push('ka_explained_placeholder');
      if (
        isPlaceholder(ru.question_explained) ||
        containsGeorgian(ru.question_explained) ||
        !containsCyrillic(ru.question_explained)
      )
        issues.push('ru_explained_bad');
      if (
        isPlaceholder(en.question_explained) ||
        containsGeorgian(en.question_explained) ||
        !containsLatin(en.question_explained)
      )
        issues.push('en_explained_bad');
      if (!hasText(ka.ai_tutor)) issues.push('ka_tutor_empty');
      if (!hasText(ru.ai_tutor)) issues.push('ru_tutor_empty');
      if (!hasText(en.ai_tutor)) issues.push('en_tutor_empty');

      if (issues.length) {
        correctionTargets.push({ id, issues, rec });
      }
    }

    correctionTargets.sort((a, b) => a.id - b.id);
    missingKaOnly.sort((a, b) => a.id - b.id);

    console.log('=== CORRECTION TARGETS (have all 3 langs but bad content) ===');
    console.log('Count:', correctionTargets.length);
    for (const t of correctionTargets) {
      console.log(`\nID ${t.id} — issues: ${t.issues.join(', ')}`);
      console.log(`  ka.question_explained: ${preview(t.rec.ka.question_explained)}`);
      console.log(`  ru.question_explained: ${preview(t.rec.ru.question_explained)}`);
      console.log(`  en.question_explained: ${preview(t.rec.en.question_explained)}`);
      console.log(`  ka.ai_tutor: ${preview(t.rec.ka.ai_tutor)}`);
      console.log(`  ru.ai_tutor: ${preview(t.rec.ru.ai_tutor)}`);
      console.log(`  en.ai_tutor: ${preview(t.rec.en.ai_tutor)}`);
    }

    console.log('\n\n=== MISSING-KA-ONLY (have ru+en, can build ka from them) ===');
    console.log('Count:', missingKaOnly.length);
    console.log(
      'IDs:',
      missingKaOnly.map((x) => x.id).join(','),
    );
    if (missingKaOnly[0]) {
      const sample = missingKaOnly[0];
      console.log(`\nSample ID ${sample.id}:`);
      console.log(`  ru.question: ${preview(sample.ru.question)}`);
      console.log(`  en.question: ${preview(sample.en.question)}`);
    }
  } finally {
    await c.close();
  }
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
