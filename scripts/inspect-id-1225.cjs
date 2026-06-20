require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  try {
    const coll = c.db(process.env.MONGODB_DB).collection('questions');
    const rows = await coll
      .find({ id: 1225 }, { projection: { _id: 0 } })
      .toArray();

    const ru = rows.find((r) => r.lang === 'ru');
    const en = rows.find((r) => r.lang === 'en');

    const findGeorgian = (label, text) => {
      if (!text) return console.log(`${label}: (empty)`);
      const matches = [...String(text).matchAll(/[ა-ჰ]/g)];
      if (matches.length === 0) {
        console.log(`${label}: no Georgian chars (len=${text.length})`);
      } else {
        console.log(`${label}: ${matches.length} Georgian char(s) found`);
        const idxs = matches.slice(0, 5).map((m) => m.index);
        for (const idx of idxs) {
          const ctx = text.slice(Math.max(0, idx - 30), idx + 30);
          console.log(`  at ${idx}: ...${ctx}...`);
        }
      }
    };

    console.log('--- RU question_explained ---');
    findGeorgian('ru', ru?.question_explained);
    console.log('\n--- EN question_explained ---');
    findGeorgian('en', en?.question_explained);
    console.log('\n--- Full RU text ---');
    console.log(ru?.question_explained);
    console.log('\n--- Full EN text ---');
    console.log(en?.question_explained);
  } finally {
    await c.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
