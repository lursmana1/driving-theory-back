require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  try {
    const coll = c.db(process.env.MONGODB_DB).collection('questions');
    const byLang = await coll
      .aggregate([{ $group: { _id: '$lang', count: { $sum: 1 } } }])
      .toArray();
    console.log('By lang:', byLang);

    const distinctIds = await coll.distinct('id');
    console.log('Distinct question IDs:', distinctIds.length);
    if (distinctIds.length) {
      console.log(
        'ID range:',
        Math.min(...distinctIds),
        '->',
        Math.max(...distinctIds),
      );
    }

    const withTutor = await coll.countDocuments({
      ai_tutor: { $exists: true, $ne: '' },
    });
    console.log('Docs with ai_tutor:', withTutor);

    const sample = await coll.findOne({}, { projection: { _id: 0 } });
    console.log('Sample doc:', JSON.stringify(sample, null, 2).slice(0, 800));
  } finally {
    await c.close();
  }
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
