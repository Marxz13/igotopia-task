import { Redis } from 'ioredis';
import { loadConfig } from '@/core/config';

// Shared ioredis connection for BullMQ. `maxRetriesPerRequest: null` is required
// so BullMQ's blocking commands don't time out. One connection per process,
// shared by the queues (producer) and the workers.

let connection: Redis | null = null;

export function getRedis(): Redis {
  if (!connection) {
    const { REDIS_URL } = loadConfig();
    connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

export async function closeRedis(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
