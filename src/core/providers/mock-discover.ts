import type { SearchRequest } from '@/core/contract';
import { pick, seeded } from './prng';
import type { CandidateLead, DiscoverProvider } from './types';

// Deterministic mock discovery, seeded by job_id. For each company it templates
// >=3 varied branded contacts across the requested roles, with one guaranteed junk
// email (info@/noreply@) per company so the verify-reject path always fires. Two
// reserved sentinel companies force terminal edge cases for testing.

export const EMPTY_COMPANY = '__empty__'; // -> 0 candidates (completed, empty inbox)
export const FAIL_COMPANY = '__fail__'; // -> throws (drives the failed-job path)

const FIRST_NAMES = [
  'Jane',
  'John',
  'Aisha',
  'Wei',
  'Carlos',
  'Priya',
  'Liam',
  'Nadia',
  'Tom',
  'Sara',
] as const;
const LAST_NAMES = [
  'Doe',
  'Roe',
  'Khan',
  'Chen',
  'Silva',
  'Patel',
  'Ng',
  'Rahman',
  'Blake',
  'Ortiz',
] as const;

function slug(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'example';
}

async function mockDiscover(input: SearchRequest, jobId: string): Promise<CandidateLead[]> {
  const companies = input.companies.map((c) => c.trim()).filter(Boolean);
  const lowered = companies.map((c) => c.toLowerCase());
  if (lowered.includes(FAIL_COMPANY)) throw new Error('mock provider failure (sentinel)');
  if (lowered.includes(EMPTY_COMPANY)) return [];

  const roles = input.roles.length > 0 ? input.roles : ['Sales Lead'];
  const out: CandidateLead[] = [];

  for (let ci = 0; ci < companies.length; ci++) {
    const company = companies[ci];
    if (!company) continue;
    const domain = `${slug(company)}.com`;
    // Seed on the company's position too, so two inputs that slug alike (or a repeated
    // company) still get their own varied, non-colliding contacts.
    const count = 3 + Math.floor(seeded(`${jobId}:${ci}:${company}:count`)() * 3); // 3-5

    for (let i = 0; i < count; i++) {
      const r = seeded(`${jobId}:${ci}:${company}:${i}`);
      const first = pick(FIRST_NAMES, r());
      const last = pick(LAST_NAMES, r());
      const role = roles[i % roles.length] ?? 'Sales Lead';
      // Guarantee the last contact per company is junk (always demoable rejection).
      const junk = i === count - 1 || r() < 0.2;
      const email = junk
        ? `${r() < 0.5 ? 'noreply' : 'info'}@${domain}`
        : `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`;

      out.push({
        // Stable across re-runs (seeded by jobId) AND globally unique — the company
        // index prefix stops two same-slug companies from sharing a key and silently
        // dropping rows on the UNIQUE(job_id, candidate_key) insert.
        candidateKey: `${ci}:${slug(company)}:${i}`,
        name: `${first} ${last}`,
        company,
        title: role,
        email,
        sourceUrl: `https://${domain}/team`,
      });
    }
  }

  return out;
}

export function createMockDiscoverProvider(): DiscoverProvider {
  return { discover: mockDiscover };
}
