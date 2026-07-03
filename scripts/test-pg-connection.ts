import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  const pgPort = Number(process.env.PG_PORT || process.env.DB_PORT);
  if (!url && pgPort === 3306) {
    console.error(
      'DB_PORT=3306 looks like MySQL. For PostgreSQL set PG_* vars or DB_PORT=5432 in .env',
    );
    console.error('See docs/POSTGRES-GETTING-STARTED.md');
    process.exit(1);
  }

  const config = url
    ? {
        connectionString: url,
        ssl:
          url.includes('sslmode=require') || url.includes('neon.tech')
            ? { rejectUnauthorized: false }
            : undefined,
      }
    : {
        host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
        port: Number(process.env.PG_PORT || process.env.DB_PORT) || 5432,
        user: process.env.PG_USERNAME || process.env.DB_USERNAME || 'postgres',
        password: process.env.PG_PASSWORD || process.env.DB_PASSWORD || '',
        database:
          process.env.PG_DATABASE || process.env.DB_DATABASE || 'driving_theory_back',
      };

  console.log('Connecting to PostgreSQL...');
  if (url) {
    console.log('  using DATABASE_URL');
  } else {
    console.log(
      `  host=${config.host} port=${(config as { port: number }).port} db=${(config as { database: string }).database} user=${(config as { user: string }).user}`,
    );
  }

  const client = new Client(config);
  try {
    await client.connect();
    const version = await client.query('SELECT version()');
    const dbName = await client.query('SELECT current_database()');
    console.log('\nConnected successfully.');
    console.log('  database:', dbName.rows[0].current_database);
    console.log('  version:', (version.rows[0].version as string).slice(0, 80) + '...');
    console.log('\nNext: start the app (creates tables if DB_SYNCHRONIZE=true), then restore data from Docker dump.');
  } catch (err) {
    console.error('\nConnection failed:', (err as Error).message);
    console.error('\nSee docs/POSTGRES-GETTING-STARTED.md for install steps.');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
