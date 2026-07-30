// Sliding-window rate limiter.
//
// Riot personal/dev keys enforce two limits at once — 20 requests/second AND
// 100 requests/2 minutes (docs/04_RIOT_API_INTEGRATION.md §5) — and the second
// one is by far the tighter of the two: 100/120s is ~0.83 req/s sustained, so
// the burst limit is almost never what's binding. Both are enforced here
// together, since satisfying only one still gets you 429'd on the other.
//
// A *sliding* window on our side is strictly safer than the fixed window Riot
// enforces on theirs: any fixed 120s window is contained in some sliding 120s
// window, so never exceeding the limit on a sliding basis means never exceeding
// it on a fixed basis either.

export type LimitWindow = {
  limit: number;
  intervalMs: number;
};

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SlidingWindowLimiter {
  private readonly windows: LimitWindow[];
  private readonly maxIntervalMs: number;

  // Timestamps of granted requests, ascending. Pruned to maxIntervalMs.
  private timestamps: number[] = [];

  // Set by notifyRateLimited() when Riot hands back a Retry-After. Blocks every
  // acquire until it passes, regardless of what our own accounting thinks.
  private pausedUntil = 0;

  // Acquisitions are chained rather than run concurrently: two callers racing
  // would both read the same "there's one slot free" state and both take it.
  private chain: Promise<void> = Promise.resolve();

  constructor(windows: LimitWindow[]) {
    this.windows = windows;
    this.maxIntervalMs = Math.max(...windows.map((w) => w.intervalMs));
  }

  // Resolves once it's safe to make a request, having reserved a slot for it.
  acquire(): Promise<void> {
    const next = this.chain.then(() => this.reserve());
    // Keep the chain alive even if one link rejects, or every later acquire
    // would inherit that rejection forever.
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  // Called after a 429 — parks the limiter for the server-dictated cooldown.
  notifyRateLimited(retryAfterMs: number) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + retryAfterMs);
  }

  // How long the next acquire() would block, without reserving anything. Used
  // by the sync's deadline guard to decide whether there's time for one more
  // call before the serverless function is killed.
  peekWaitMs(): number {
    const now = Date.now();
    this.prune(now);
    return this.waitMs(now);
  }

  private async reserve(): Promise<void> {
    // Loop rather than sleep-once: a long pause can be extended by a 429
    // landing while we're asleep, and pruning can shift the next free slot.
    for (;;) {
      const now = Date.now();
      this.prune(now);

      const wait = this.waitMs(now);
      if (wait <= 0) {
        this.timestamps.push(now);
        return;
      }

      await sleep(wait);
    }
  }

  private waitMs(now: number): number {
    let wait = Math.max(0, this.pausedUntil - now);

    for (const window of this.windows) {
      const cutoff = now - window.intervalMs;
      // timestamps is ascending, so everything from the first index at or after
      // the cutoff onward is inside this window.
      let firstInWindow = 0;
      while (firstInWindow < this.timestamps.length && this.timestamps[firstInWindow] <= cutoff) {
        firstInWindow += 1;
      }

      const inWindow = this.timestamps.length - firstInWindow;
      if (inWindow < window.limit) continue;

      // The window is full. It frees up once the oldest call that still counts
      // against it ages out.
      const oldestCounted = this.timestamps[this.timestamps.length - window.limit];
      wait = Math.max(wait, oldestCounted + window.intervalMs - now + 1);
    }

    return wait;
  }

  private prune(now: number) {
    const cutoff = now - this.maxIntervalMs;
    let drop = 0;
    while (drop < this.timestamps.length && this.timestamps[drop] <= cutoff) {
      drop += 1;
    }
    if (drop > 0) this.timestamps = this.timestamps.slice(drop);
  }
}
