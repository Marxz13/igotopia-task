// Entry point for `npm run seed`. Seeds the two demo orgs, users, and memberships.
import { closeDb, getDb } from '@/core/db/client';
import { memberships, organizations, users } from '@/core/db/schema';

const MARZLABS_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ALLANINC_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const MARZ_ID = 'a1a1a1a1-0000-4000-8000-000000000001';
const ALLAN_ID = 'a2a2a2a2-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  const db = getDb();

  // Marz Labs = 10 credits, Allan Inc = 1 to exercise the insufficient-credit path fast.
  await db
    .insert(organizations)
    .values([
      { id: MARZLABS_ID, name: 'Marz Labs', credits: 10 },
      { id: ALLANINC_ID, name: 'Allan Inc', credits: 1 },
    ])
    .onConflictDoNothing();

  await db
    .insert(users)
    .values([
      { id: MARZ_ID, email: 'marz@test.com', name: 'Marz' },
      { id: ALLAN_ID, email: 'allan@test.com', name: 'Allan' },
    ])
    .onConflictDoNothing();

  // Allan belongs to both orgs, which exercises the switcher and proves isolation.
  await db
    .insert(memberships)
    .values([
      { userId: MARZ_ID, organizationId: MARZLABS_ID },
      { userId: ALLAN_ID, organizationId: MARZLABS_ID },
      { userId: ALLAN_ID, organizationId: ALLANINC_ID },
    ])
    .onConflictDoNothing();

  console.log('[seed] ok — Marz Labs(10)/Allan Inc(1), marz(Marz Labs), allan(Marz Labs+Allan Inc)');
}

main()
  .catch((err: unknown) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
