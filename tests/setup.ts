import 'dotenv/config';
import { afterAll } from 'vitest';
import { closeDb } from '@/core/db/client';
import { closeRedis } from '@/core/queue/connection';

afterAll(async () => {
  await closeRedis();
  await closeDb();
});
