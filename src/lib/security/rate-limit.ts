/**
 * Fixed-window in-memory rate limiter.
 *
 * LIMITATION: state is per server instance. With several instances behind a
 * load balancer, use a shared store (e.g. Redis / ElastiCache) – the
 * `RateLimiter` interface allows swapping the implementation.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult;
}

export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  constructor(private readonly now: () => number = Date.now) {}

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const t = this.now();
    this.sweep(t);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      this.buckets.set(key, { count: 1, resetAt: t + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }
    if (bucket.count >= limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - t) / 1000) };
    }
    bucket.count += 1;
    return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
  }

  private sweep(t: number): void {
    if (t - this.lastSweep < 60_000) return;
    this.lastSweep = t;
    for (const [k, b] of this.buckets) if (b.resetAt <= t) this.buckets.delete(k);
  }
}

const globalForRl = globalThis as unknown as { __scribmedRateLimiter?: RateLimiter };
export function getRateLimiter(): RateLimiter {
  globalForRl.__scribmedRateLimiter ??= new MemoryRateLimiter();
  return globalForRl.__scribmedRateLimiter;
}
export function setRateLimiter(rl: RateLimiter | null): void {
  globalForRl.__scribmedRateLimiter = rl ?? undefined;
}
