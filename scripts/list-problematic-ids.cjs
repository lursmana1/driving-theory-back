require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const PLACEHOLDER_EXPLANATION_PREFIX = 'განმარტება მალე დაემატება';
const PLACEHOLDER_EXPLANATION_KEYWORD = 'იხილე კანონი საგზაო მოძრაობის შესახებ';

function hasText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isPlaceholderExplanation(text) {
  if (!text) return true;
  const normalized = String(text).trim().toLowerCase();
  return (
    normalized.includes(PLACEHOLDER_EXPLANATION_PREFIX.toLowerCase()) ||
    normalized.includes(PLACEHOLDER_EXPLANATION_KEYWORD.toLowerCase())
  );
}

function containsGeorgian(text) {
  if (!text) return false;
  return /[ა-ჰ]/.test(text);
}

function containsCyrillic(text) {
  if (!text) return false;
  return /[А-Яа-яЁё]/.test(text);
}

function containsLatin(text) {
  if (!text) return false;
  return /[A-Za-z]/.test(text);
}

function isPredominantlyGeorgian(text) {
  if (!text) return false;
  const georgianCount = (String(text).match(/[ა-ჰ]/g) || []).length;
  if (georgianCount < 5) return false;
  const ratio = georgianCount / String(text).length;
  return ratio > 0.05;
}

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
    for (const row of rows) {
      const rec = byId.get(row.id) ?? {};
      rec[row.lang] = row;
      byId.set(row.id, rec);
    }

    const issues = [];
    for (const [id, rec] of byId) {
      const reasons = [];
      const ka = rec.ka;
      const ru = rec.ru;
      const en = rec.en;

      if (!ka) reasons.push('missing_ka');
      if (!ru) reasons.push('missing_ru');
      if (!en) reasons.push('missing_en');

      if (ru && !hasText(ru.question)) reasons.push('missing_ru_question');
      if (en && !hasText(en.question)) reasons.push('missing_en_question');

      if (!ka || isPlaceholderExplanation(ka.question_explained)) {
        reasons.push('missing_ka_explained');
      }
      if (
        !ru ||
        isPlaceholderExplanation(ru.question_explained) ||
        isPredominantlyGeorgian(ru.question_explained) ||
        !containsCyrillic(ru.question_explained)
      ) {
        reasons.push('missing_ru_explained');
      }
      if (
        !en ||
        isPlaceholderExplanation(en.question_explained) ||
        isPredominantlyGeorgian(en.question_explained) ||
        !containsLatin(en.question_explained)
      ) {
        reasons.push('missing_en_explained');
      }

      if (!ka || !hasText(ka.ai_tutor)) reasons.push('missing_ka_tutor');
      if (!ru || !hasText(ru.ai_tutor)) reasons.push('missing_ru_tutor');
      if (!en || !hasText(en.ai_tutor)) reasons.push('missing_en_tutor');

      if (reasons.length > 0) {
        issues.push({
          id,
          has_ka: !!ka,
          has_ru: !!ru,
          has_en: !!en,
          reasons,
        });
      }
    }

    issues.sort((a, b) => a.id - b.id);

    const totals = {
      total: issues.length,
      missing_ka_only: issues.filter(
        (x) => !x.has_ka && x.has_ru && x.has_en,
      ).length,
      missing_ka: issues.filter((x) => !x.has_ka).length,
      missing_ru: issues.filter((x) => !x.has_ru).length,
      missing_en: issues.filter((x) => !x.has_en).length,
      has_all_three_langs: issues.filter(
        (x) => x.has_ka && x.has_ru && x.has_en,
      ).length,
    };

    const outDir = path.resolve(process.cwd());
    const jsonPath = path.join(outDir, 'problematic-question-ids.json');
    const csvPath = path.join(outDir, 'problematic-question-ids.csv');

    fs.writeFileSync(
      jsonPath,
      JSON.stringify({ totals, issues }, null, 2),
      'utf-8',
    );

    const header = 'id,has_ka,has_ru,has_en,reasons';
    const lines = issues.map(
      (x) =>
        `${x.id},${x.has_ka ? 1 : 0},${x.has_ru ? 1 : 0},${x.has_en ? 1 : 0},"${x.reasons.join('|')}"`,
    );
    fs.writeFileSync(csvPath, [header, ...lines].join('\n'), 'utf-8');

    console.log('Summary:', JSON.stringify(totals, null, 2));
    console.log('Wrote:', jsonPath);
    console.log('Wrote:', csvPath);

    const idsMissingKa = issues.filter((x) => !x.has_ka).map((x) => x.id);
    console.log('\nIDs missing ka row (', idsMissingKa.length, '):');
    console.log(idsMissingKa.join(','));
  } finally {
    await c.close();
  }
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
