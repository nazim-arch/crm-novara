import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Duration = `${number} ${"ms" | "s" | "m" | "h" | "d"}`;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

if (!redis && process.env.NODE_ENV !== "test") {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set — rate limiting disabled"
  );
}

// Cache Ratelimit instances so we don't recreate them on every request
const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, window: string, prefix: string): Ratelimit {
  const key = `${prefix}:${limit}:${window}`;
  if (!limiters.has(key)) {
    limiters.set(
      key,
      new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(limit, window as Duration),
        prefix: `rl:${prefix}`,
      })
    );
  }
  return limiters.get(key)!;
}

export type RatelimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix ms — when the window resets
};

/**
 * Check rate limit for a request. Each prefix gets its own counter in Redis,
 * so different route buckets don't share state even for the same IP.
 *
 * Returns { success: true } immediately when Redis is not configured (dev/CI
 * without Upstash credentials).
 */
export async function ratelimit(
  request: Request,
  limit: number,
  window: string,
  prefix = "api"
): Promise<RatelimitResult> {
  if (!redis) {
    return { success: true, limit, remaining: limit, reset: 0 };
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";

  const result = await getLimiter(limit, window, prefix).limit(ip);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}
