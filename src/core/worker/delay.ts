import { getJobStatusSystem } from '@/core/repositories/job-repository';

// Cooperative cancellation for the stage pauses. The delay is what makes cancel
// meaningful: instead of one blocking sleep, we poll the job status in small steps so
// a cancel takes effect within ~100ms instead of after the full delay.

const POLL_STEP_MS = 100;

export async function isCancelled(jobId: string): Promise<boolean> {
  return (await getJobStatusSystem(jobId)) === 'cancelled';
}

/** Sleep up to `ms`, checking for cancellation every ~100ms. Returns 'cancelled' as
 * soon as the job is cancelled, else 'done' when the time elapses. ms <= 0 still does
 * one cancellation check (so an already-cancelled job stops immediately). */
export async function cancellableSleep(jobId: string, ms: number): Promise<'done' | 'cancelled'> {
  let waited = 0;
  while (waited < ms) {
    if (await isCancelled(jobId)) return 'cancelled';
    const step = Math.min(POLL_STEP_MS, ms - waited);
    await new Promise((resolve) => setTimeout(resolve, step));
    waited += step;
  }
  return (await isCancelled(jobId)) ? 'cancelled' : 'done';
}
