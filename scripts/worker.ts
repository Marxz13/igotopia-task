// Entry point for the worker process, separate from the web app.

export {};

async function main(): Promise<void> {
  console.log('[worker] not implemented yet.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
