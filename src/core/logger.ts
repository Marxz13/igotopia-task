import pino from 'pino';

// Structured logger (pino). Independent of loadConfig so it never needs the full env
// to exist; callers attach job_id / org_id as child bindings. Silent under
// NODE_ENV=test to keep test output clean.

let logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (!logger) {
    const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info');
    // Drop pid/hostname noise.
    logger = pino({ level, base: null });
  }
  return logger;
}
