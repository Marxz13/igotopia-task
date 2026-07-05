// Entry point for `npm run seed`.

export {};

async function main(): Promise<void> {
  console.log('[seed] not implemented yet.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
