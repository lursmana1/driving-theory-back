import { DataSource, Repository } from 'typeorm';
import { Question } from '../../src/questions/entities/question.entity';

type EntityClass = Function;

export function createPgDataSource(
  entities: EntityClass[] = [Question],
): DataSource {
  const url = process.env.DATABASE_URL;
  if (url) {
    return new DataSource({
      type: 'postgres',
      url,
      entities,
      synchronize: false,
      ssl:
        process.env.DATABASE_SSL === 'true' ||
        url.includes('sslmode=require') ||
        url.includes('neon.tech')
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
    entities,
    synchronize: false,
  });
}

export async function initPg(
  entities: EntityClass[] = [Question],
): Promise<DataSource> {
  const ds = createPgDataSource(entities);
  await ds.initialize();
  return ds;
}

export async function distinctQuestionIds(
  repo: Repository<Question>,
): Promise<number[]> {
  const rows = await repo
    .createQueryBuilder('q')
    .select('DISTINCT q.id', 'id')
    .orderBy('q.id', 'ASC')
    .getRawMany<{ id: string }>();
  return rows.map((r) => Number(r.id));
}

export async function upsertQuestionRow(
  repo: Repository<Question>,
  row: Partial<Question> & { id: number; lang: string },
): Promise<void> {
  await repo.upsert(row, { conflictPaths: ['id', 'lang'] });
}
