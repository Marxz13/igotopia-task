import { Queue } from 'bullmq';
import { loadConfig } from '@/core/config';
import { getRedis } from './connection';

// Two queues keep the discover and verify stages separate instead of one sync
// loop. The Postgres jobs row stays the status source of truth the UI polls;
// these queues only drive worker execution.

export const QUEUE_NAMES = {
  discover: 'discover',
  verify: 'verify',
} as const;

export interface StageJobData {
  jobId: string;
}

let discoverQueue: Queue<StageJobData> | null = null;
let verifyQueue: Queue<StageJobData> | null = null;

export function getDiscoverQueue(): Queue<StageJobData> {
  if (!discoverQueue) {
    discoverQueue = new Queue<StageJobData>(QUEUE_NAMES.discover, {
      connection: getRedis(),
      prefix: loadConfig().QUEUE_PREFIX,
    });
  }
  return discoverQueue;
}

export function getVerifyQueue(): Queue<StageJobData> {
  if (!verifyQueue) {
    verifyQueue = new Queue<StageJobData>(QUEUE_NAMES.verify, {
      connection: getRedis(),
      prefix: loadConfig().QUEUE_PREFIX,
    });
  }
  return verifyQueue;
}
