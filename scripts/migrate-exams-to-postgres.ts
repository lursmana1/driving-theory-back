import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { DataSource } from 'typeorm';
import { Exam } from '../src/exams/entities/exam.entity';

function pgDataSource(): DataSource {
  const url = process.env.DATABASE_URL;
  if (url) {
    return new DataSource({
      type: 'postgres',
      url,
      entities: [Exam],
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
    database: process.env.PG_DATABASE || 'nneesstt',
    entities: [Exam],
    synchronize: true,
  });
}

async function resolveQuestionIds(
  questionsCol: ReturnType<ReturnType<MongoClient['db']>['collection']>,
  refs: unknown[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const ref of refs) {
    if (typeof ref === 'number' && Number.isFinite(ref)) {
      ids.push(ref);
      continue;
    }
    if (typeof ref === 'string' && /^\d+$/.test(ref)) {
      ids.push(Number(ref));
      continue;
    }
    const oid =
      ref instanceof ObjectId
        ? ref
        : typeof ref === 'string' && ObjectId.isValid(ref)
          ? new ObjectId(ref)
          : null;
    if (!oid) continue;

    const q = await questionsCol.findOne(
      { _id: oid },
      { projection: { id: 1 } },
    );
    if (q?.id != null) ids.push(Number(q.id));
  }
  return [...new Set(ids)];
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
  const db = mongo.db(mongoDb);
  const examsCol = db.collection('exams');
  const questionsCol = db.collection('questions');

  const total = await examsCol.countDocuments();
  console.log(`MongoDB exams to copy: ${total}`);

  const repo = ds.getRepository(Exam);
  let copied = 0;

  const cursor = examsCol.find({});
  for await (const doc of cursor) {
    const refs = doc.questions ?? doc.questionIds ?? [];
    const questionIds = await resolveQuestionIds(
      questionsCol,
      Array.isArray(refs) ? refs : [],
    );

    const row = repo.create({
      title: String(doc.title ?? 'Exam'),
      lang: String(doc.lang ?? 'ka'),
      questionIds,
      createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
    });
    await repo.save(row);
    copied++;
  }

  console.log(`Copied ${copied} exams.`);
  await mongo.close();
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
