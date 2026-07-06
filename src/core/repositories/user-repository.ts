import { eq } from 'drizzle-orm';
import { getDb } from '@/core/db/client';
import { users, type User } from '@/core/db/schema';

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}
