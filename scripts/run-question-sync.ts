/**
 * Standalone script to run question sync.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/run-question-sync.ts [limit] [offset]
 *
 * Examples:
 *   npx ts-node -r tsconfig-paths/register scripts/run-question-sync.ts 5        # Test: 5 IDs
 *   npx ts-node -r tsconfig-paths/register scripts/run-question-sync.ts 1200    # Day 1: IDs 1-1200
 *   npx ts-node -r tsconfig-paths/register scripts/run-question-sync.ts 600 1200 # Day 2: IDs 1201-1800
 *
 * Requires: GEMINI_API_KEY, MONGODB_URI in .env
 */

import { NestFactory } from '@nestjs/core';
import { QuestionSyncStandaloneModule } from '../src/question-sync/question-sync-standalone.module';
import { QuestionSyncService } from '../src/question-sync/question-sync.service';

async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : 5;
  const offset = process.argv[3] ? parseInt(process.argv[3], 10) : 0;

  const app = await NestFactory.createApplicationContext(QuestionSyncStandaloneModule);
  const sync = app.get(QuestionSyncService);

  console.log(`Starting sync: limit=${limit}, offset=${offset}`);
  const result = await sync.runSync({ limit, offset });
  console.log(`Done. Processed: ${result.processed}, Errors: ${result.errors}`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
