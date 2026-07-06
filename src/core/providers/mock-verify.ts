import type { ScoreFactor } from '@/core/contract';
import type { CandidateLead, VerifyProvider, VerifyResult } from './types';

// Deterministic mock verification, two steps:
//   1. Deliverability - reject role/disposable addresses (noreply, info@).
//   2. Quality score - a transparent 0-100 score for the survivors.
//
// The score isn't random: it's the clamped sum of named feature points, each tied to
// a signal on the candidate (title, email shape, corporate vs public domain, profile
// completeness). Each lead keeps its factor breakdown, so a 91 vs a 68 is explainable
// - the same score + reasons a real ML/LLM scorer emits, just rule-based here.

// Title seniority tiers, most senior first; only the top match counts. Closer to the
// decision-maker = more points.
const SENIORITY: ReadonlyArray<readonly [RegExp, number, string]> = [
  [/\b(chief|ceo|cfo|cto|coo|cmo|cxo|founder|owner|president)\b/, 35, 'C-level / founder'],
  [/\b(vp|vice ?president|svp|evp)\b/, 28, 'VP-level'],
  [/\b(head|director|gm|general ?manager)\b/, 22, 'Head / Director'],
  [/\b(manager|lead|principal)\b/, 12, 'Manager / Lead'],
];

// Free/consumer mail providers - a B2B contact on one is a weaker lead than one on a
// corporate domain.
const PUBLIC_DOMAIN =
  /^(gmail|googlemail|outlook|hotmail|live|yahoo|ymail|proton(mail)?|icloud|aol)\./;
// Shared/role mailboxes that pass the deliverability screen but aren't a person.
const ROLE_LOCAL = /^(sales|contact|team|hello|admin|support|marketing|hr|office|enquiries)$/;
// A named mailbox (first.last) is a real person - the strongest email signal.
const NAMED_LOCAL = /^[a-z]+[._][a-z]+/;

// Pure, deterministic scorer. Returns the 0-100 score plus the factors that sum to
// it. No seed, no randomness - same input always gives the same output.
export function scoreCandidate(candidate: CandidateLead): {
  score: number;
  factors: ScoreFactor[];
} {
  const factors: ScoreFactor[] = [];
  const title = candidate.title.toLowerCase();
  const email = candidate.email.toLowerCase();
  const local = email.split('@')[0] ?? '';
  const domain = email.split('@')[1] ?? '';

  // Baseline: cleared discovery + the deliverability screen.
  factors.push({ label: 'Base (passed verification)', points: 40 });

  // Title seniority - highest matching tier only.
  const tier = SENIORITY.find(([re]) => re.test(title));
  factors.push(
    tier
      ? { label: `${tier[2]} title`, points: tier[1] }
      : { label: 'Individual-contributor title', points: 4 },
  );

  // Email domain quality.
  if (PUBLIC_DOMAIN.test(domain)) factors.push({ label: 'Public email provider', points: -25 });
  else factors.push({ label: 'Corporate domain', points: 8 });

  // Email mailbox shape.
  if (ROLE_LOCAL.test(local)) factors.push({ label: 'Shared / role mailbox', points: -15 });
  else if (NAMED_LOCAL.test(local))
    factors.push({ label: 'Named mailbox (first.last)', points: 10 });

  // Profile completeness.
  if (candidate.name.trim().split(/\s+/).length >= 2)
    factors.push({ label: 'Full name', points: 4 });
  if (candidate.sourceUrl) factors.push({ label: 'Source URL present', points: 3 });

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  return { score, factors };
}

function mockVerify(candidate: CandidateLead): VerifyResult {
  const email = candidate.email.toLowerCase();
  if (email.includes('noreply') || email.startsWith('info@')) {
    return { ok: false, reason: 'Disposable / role-based email address' };
  }
  const { score, factors } = scoreCandidate(candidate);
  return { ok: true, score, factors };
}

export function createMockVerifyProvider(): VerifyProvider {
  return { verify: (candidate) => Promise.resolve(mockVerify(candidate)) };
}
