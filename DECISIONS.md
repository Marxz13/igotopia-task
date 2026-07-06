# Decisions

## 3 things I'd do differently with 2 more days

- Swap the sweeper for a real outbox (Sweeper is something i built custom to clean up messy works). If the DB commit but then the enqueue gets lost, a sweeper catches it on the next pass, but that's up to 10s of the job just sitting there doing nothing. I'd write the enqueue into the same transaction as the job and have a relay drain it, so there's no gap to catch.

- Probably move job progress to SSE instead of polling.
  - The UI polls the job and its event log on a timer. It's fine, but chatty, and `/events` is just a JSON snapshot today. A stream would update the moment something changes and stop on its own when the job finishes, with no poll loop to babysit. All in all SSE would be cleaner work than polling

- Also write more of the mean tests. I'd add the cross-org pokes they said they'll try (reaching for another org's `job_id` / `lead_id`) and a real concurrency test that fires a batch of identical submits at once, not just a double-click, to prove the credit charge holds under an actual race and not a sequential one.

## 2 risks I accepted for the time box

- Spent about 30 minutes making the dashboard actually look good, even though the brief says UI isn't scored. I used Claude to design the dashboard I had in my head, then built from there. But I'd take a clean-looking car over an ugly truck anyday.
- The idempotency key is generated on the client, and if `crypto.randomUUID` fallback will be `Math.random` + timestamp. Fallback quite weak, but again the chances of them colliding is me winning a lottery, really low (It's a tiny risk)
