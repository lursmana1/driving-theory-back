import 'dotenv/config';
import mysql from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import { Blog } from '../src/blogs/entities/blog.entity';
import { ExamAttempt } from '../src/exam-attempts/entities/exam-attempt.entity';
import { UserAnswer } from '../src/exam-attempts/entities/user-answer.entity';
import { LeaderboardPeriod } from '../src/leaderboard/entities/leaderboard-period.entity';

const ENTITIES = [User, Blog, ExamAttempt, UserAnswer, LeaderboardPeriod];

type MysqlConn = mysql.Connection;

async function mysqlConnect(): Promise<MysqlConn> {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'nest',
  });
}

function pgDataSource(): DataSource {
  const url = process.env.DATABASE_URL;
  if (url) {
    return new DataSource({
      type: 'postgres',
      url,
      entities: ENTITIES,
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
    entities: ENTITIES,
    synchronize: true,
  });
}

function parseJsonArray(val: unknown): number[] {
  if (Array.isArray(val)) return val.map(Number);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val) as unknown;
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  }
  if (Buffer.isBuffer(val)) {
    return parseJsonArray(val.toString('utf8'));
  }
  return [];
}

async function copyUsers(mysql: MysqlConn, pg: DataSource): Promise<void> {
  const [rows] = await mysql.query(
    'SELECT id, name, surname, email, password, googleId, type FROM users ORDER BY id',
  );
  const list = rows as mysql.RowDataPacket[];
  const repo = pg.getRepository(User);
  for (const r of list) {
    await repo.save({
      id: Number(r.id),
      name: r.name,
      surname: r.surname ?? null,
      email: r.email,
      password: r.password ?? null,
      googleId: r.googleId ?? null,
      type: r.type ?? 'user',
    });
  }
  if (list.length > 0) {
    await pg.query(
      `SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users))`,
    );
  }
  console.log(`users: ${list.length}`);
}

async function copyBlogs(mysql: MysqlConn, pg: DataSource): Promise<void> {
  const [rows] = await mysql.query(
    'SELECT id, name, description, content, imageUrl, creatorId, createdAt FROM blogs ORDER BY id',
  );
  const list = rows as mysql.RowDataPacket[];
  for (const r of list) {
    await pg.query(
      `INSERT INTO blogs (id, name, description, content, "imageUrl", "creatorId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         content = EXCLUDED.content,
         "imageUrl" = EXCLUDED."imageUrl",
         "creatorId" = EXCLUDED."creatorId",
         "createdAt" = EXCLUDED."createdAt"`,
      [
        Number(r.id),
        r.name,
        r.description,
        r.content,
        r.imageUrl,
        r.creatorId != null ? Number(r.creatorId) : null,
        r.createdAt ? new Date(r.createdAt) : new Date(),
      ],
    );
  }
  if (list.length > 0) {
    await pg.query(
      `SELECT setval(pg_get_serial_sequence('blogs', 'id'), (SELECT MAX(id) FROM blogs))`,
    );
  }
  console.log(`blogs: ${list.length}`);
}

async function copyLeaderboardPeriods(
  mysql: MysqlConn,
  pg: DataSource,
): Promise<void> {
  const [rows] = await mysql.query(
    'SELECT id, startDate, endDate, name, createdAt FROM leaderboard_periods ORDER BY id',
  );
  const list = rows as mysql.RowDataPacket[];
  const repo = pg.getRepository(LeaderboardPeriod);
  for (const r of list) {
    await repo.save({
      id: Number(r.id),
      startDate: new Date(r.startDate),
      endDate: new Date(r.endDate),
      name: r.name ?? null,
      createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    });
  }
  if (list.length > 0) {
    await pg.query(
      `SELECT setval(pg_get_serial_sequence('leaderboard_periods', 'id'), (SELECT MAX(id) FROM leaderboard_periods))`,
    );
  }
  console.log(`leaderboard_periods: ${list.length}`);
}

async function copyExamAttempts(
  mysql: MysqlConn,
  pg: DataSource,
): Promise<void> {
  const [rows] = await mysql.query(
    `SELECT id, userId, questionIds, lang, createdAt, endDate, completedAt, passed, durationSeconds
     FROM exam_attempts ORDER BY id`,
  );
  const list = rows as mysql.RowDataPacket[];
  for (const r of list) {
    await pg.query(
      `INSERT INTO exam_attempts (id, "userId", "questionIds", lang, "createdAt", "endDate", "completedAt", passed, "durationSeconds")
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         "userId" = EXCLUDED."userId",
         "questionIds" = EXCLUDED."questionIds",
         lang = EXCLUDED.lang,
         "createdAt" = EXCLUDED."createdAt",
         "endDate" = EXCLUDED."endDate",
         "completedAt" = EXCLUDED."completedAt",
         passed = EXCLUDED.passed,
         "durationSeconds" = EXCLUDED."durationSeconds"`,
      [
        Number(r.id),
        Number(r.userId),
        JSON.stringify(parseJsonArray(r.questionIds)),
        r.lang ?? 'ka',
        r.createdAt ? new Date(r.createdAt) : new Date(),
        r.endDate ? new Date(r.endDate) : null,
        r.completedAt ? new Date(r.completedAt) : null,
        r.passed === null || r.passed === undefined ? null : Boolean(r.passed),
        r.durationSeconds != null ? Number(r.durationSeconds) : null,
      ],
    );
  }
  if (list.length > 0) {
    await pg.query(
      `SELECT setval(pg_get_serial_sequence('exam_attempts', 'id'), (SELECT MAX(id) FROM exam_attempts))`,
    );
  }
  console.log(`exam_attempts: ${list.length}`);
}

async function copyUserAnswers(
  mysql: MysqlConn,
  pg: DataSource,
): Promise<void> {
  const [rows] = await mysql.query(
    `SELECT id, attemptId, questionId, subject, correct, chosenAnswer, createdAt
     FROM user_answers ORDER BY id`,
  );
  const list = rows as mysql.RowDataPacket[];
  let copied = 0;
  for (const r of list) {
    await pg.query(
      `INSERT INTO user_answers (id, "attemptId", "questionId", subject, correct, "chosenAnswer", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         "attemptId" = EXCLUDED."attemptId",
         "questionId" = EXCLUDED."questionId",
         subject = EXCLUDED.subject,
         correct = EXCLUDED.correct,
         "chosenAnswer" = EXCLUDED."chosenAnswer",
         "createdAt" = EXCLUDED."createdAt"`,
      [
        Number(r.id),
        Number(r.attemptId),
        Number(r.questionId),
        r.subject != null ? Number(r.subject) : null,
        Boolean(r.correct),
        String(r.chosenAnswer),
        r.createdAt ? new Date(r.createdAt) : new Date(),
      ],
    );
    copied++;
  }
  if (copied > 0) {
    await pg.query(
      `SELECT setval(pg_get_serial_sequence('user_answers', 'id'), (SELECT MAX(id) FROM user_answers))`,
    );
  }
  console.log(`user_answers: ${copied}`);
}

async function main() {
  const mysql = await mysqlConnect();
  console.log('MySQL connected.');

  const pg = pgDataSource();
  await pg.initialize();
  console.log('PostgreSQL connected, schema synchronized.');

  await copyUsers(mysql, pg);
  await copyBlogs(mysql, pg);
  await copyLeaderboardPeriods(mysql, pg);
  await copyExamAttempts(mysql, pg);
  await copyUserAnswers(mysql, pg);

  console.log('MySQL → PostgreSQL migration complete.');
  await mysql.end();
  await pg.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
