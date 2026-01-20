import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let ratelimit: Ratelimit | null = null;

function getRateLimiter() {
  if (ratelimit) return ratelimit;

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 h'),
    analytics: true,
    prefix: 'sms-reminder',
  });

  return ratelimit;
}

export async function checkRateLimit(
  identifier: string,
  type: 'stt' | 'schedule'
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const limiter = getRateLimiter();

  if (!limiter) {
    return { success: true, remaining: 999, reset: 0 };
  }

  const key = `${type}:${identifier}`;
  const result = await limiter.limit(key);

  return {
    success: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}

export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  return '127.0.0.1';
}
