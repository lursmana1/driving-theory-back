import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { DataSource } from 'typeorm';
import { Category } from '../src/categories/entities/category.entity';

function pgDataSource(): DataSource {
  const url = process.env.DATABASE_URL;
  if (url) {
    return new DataSource({
      type: 'postgres',
      url,
      entities: [Category],
      synchronize: true,
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: false }
          : false,
    });
  }

  return new DataSource({
    type: 'postgres',
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT) || 5432,
    username: process.env.PG_USERNAME || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'driving_theory_back',
    entities: [Category],
    synchronize: true,
  });
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const mongoDb = process.env.MONGODB_DB;
  if (!mongoUri || !mongoDb) {
    throw new Error('MONGODB_URI and MONGODB_DB must be set.');
  }

  const ds = pgDataSource();
  await ds.initialize();
  console.log('PostgreSQL connected.');

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const col = mongo.db(mongoDb).collection('categories');

  const total = await col.countDocuments();
  console.log(`MongoDB categories to copy: ${total}`);

  const repo = ds.getRepository(Category);
  let copied = 0;

  const cursor = col.find({});
  for await (const doc of cursor) {
    const id = Number(doc.id ?? doc._id);
    if (!Number.isFinite(id)) {
      console.warn('Skipping category with invalid id:', doc);
      continue;
    }

    await repo.upsert(
      {
        id,
        name: String(doc.name ?? ''),
        iconKey: doc.iconKey ?? null,
        questionsCount: Number(doc.questionsCount ?? 0),
        subjectCount: Number(doc.subjectCount ?? 0),
        subjects: Array.isArray(doc.subjects) ? doc.subjects : [],
      },
      { conflictPaths: ['id'] },
    );
    copied++;
  }

  console.log(`Copied ${copied} categories.`);
  await mongo.close();
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
