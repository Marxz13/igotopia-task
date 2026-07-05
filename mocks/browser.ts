// Browser-side MSW worker. Intercepts client fetch in dev so the frontend runs
// against the mock handlers. Requires public/mockServiceWorker.js (npx msw init public).

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
