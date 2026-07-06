// Thrown by the discover stage when CRASH_AFTER_DISCOVER is set. It's a catchable
// error (tests assert on it); the worker entrypoint recognizes it and calls
// process.exit(1) to simulate a hard crash after the idempotent insert.
export class CrashAfterDiscover extends Error {
  constructor() {
    super('CRASH_AFTER_DISCOVER');
    this.name = 'CrashAfterDiscover';
  }
}
