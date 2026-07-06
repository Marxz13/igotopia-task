// Entry point for `npm run worker`, a separate process from the web app. Boots the
// BullMQ discover + verify Workers and the sweeper (see @/core/worker/runner).

import 'dotenv/config'; // load .env so `npm run worker` needs no manual env sourcing
import { runWorker } from '@/core/worker/runner';

export {};

runWorker().catch((err: unknown) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
