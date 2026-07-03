import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { DataSource } from 'typeorm';
import { Question } from '../src/questions/entities/question.entity';

const BATCH = 200;

function pgDataSource(): DataSource {
  const url = process.env.DATABASE_URL;
  if (url) {
    return new DataSource({
      type: 'postgres',
      url,
      entities: [Question],
      synchronize: true,
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: false }
          : false,
    });
  }

  return new DataSource({
    type: 'postgres',
    host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.PG_PORT || process.env.DB_PORT) || 5432,
    username: process.env.PG_USERNAME || process.env.DB_USERNAME || 'postgres',
    password: process.env.PG_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.PG_DATABASE || process.env.DB_DATABASE || 'driving_theory_back',
    entities: [Question],
    synchronize: true,
  });
}

async function ensureGinIndex(ds: DataSource): Promise<void> {
  await ds.query(`
    CREATE INDEX IF NOT EXISTS idx_questions_categories_gin
    ON questions USING gin (categories)
  `);
  await ds.query(`
    CREATE INDEX IF NOT EXISTS idx_questions_lang_categories
    ON questions (lang, categories)
  `);
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const mongoDb = process.env.MONGODB_DB;
  if (!mongoUri || !mongoDb) {
    throw new Error('MONGODB_URI and MONGODB_DB must be set (source MongoDB).');
  }

  const ds = pgDataSource();
  await ds.initialize();
  console.log('PostgreSQL connected, schema synchronized.');

  await ensureGinIndex(ds);
  console.log('GIN index on categories ready.');

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const col = mongo.db(mongoDb).collection('questions');

  const total = await col.countDocuments();
  console.log(`MongoDB questions to copy: ${total}`);

  const repo = ds.getRepository(Question);
  let copied = 0;

  const cursor = col.find({}).batchSize(BATCH);
  let batch: Question[] = [];

  for await (const doc of cursor) {
    const row = repo.create({
      id: doc.id,
      lang: doc.lang,
      question: doc.question ?? '',
      question_explained: doc.question_explained ?? null,
      hasImg: doc.hasImg ?? 0,
      correct_answer: doc.correct_answer ?? null,
      answer_1: doc.answer_1 ?? null,
      answer_2: doc.answer_2 ?? null,
      answer_3: doc.answer_3 ?? null,
      answer_4: doc.answer_4 ?? null,
      subject: doc.subject ?? null,
      categories: Array.isArray(doc.categories) ? doc.categories : [],
      audio: doc.audio ?? null,
      ai_tutor: doc.ai_tutor ?? null,
      img: doc.img ?? null,
    });
    batch.push(row);

    if (batch.length >= BATCH) {
      await repo.save(batch, { chunk: BATCH });
      copied += batch.length;
      console.log(`  copied ${copied}/${total}`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await repo.save(batch, { chunk: BATCH });
    copied += batch.length;
  }

  const pgCount = await repo.count();
  console.log(`\nDone. Mongo=${total}, inserted batches=${copied}, PG rows=${pgCount}`);

  await mongo.close();
  await ds.destroy();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
