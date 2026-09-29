import type { NextFunction, Request, Response } from "express";
import { redis } from "../lib/redis.js";
import { hashIp } from "../lib/ip-hash.js";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Increments a Redis counter under `key`, resetting after windowSeconds. */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  if (count > max) {
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfterSeconds: Math.max(ttl, 1) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

interface RateLimitOptions {
  /** Redis key prefix, e.g. "rl:anon-session" */
  keyPrefix: string;
  /** Max requests allowed within the window */
  max: number;
  /** Window length in seconds */
  windowSeconds: number;
}

export function rateLimit({ keyPrefix, max, windowSeconds }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${hashIp(req)}`;
    const result = await checkRateLimit(key, max, windowSeconds);

    if (!result.allowed) {
      res.setHeader("Retry-After", result.retryAfterSeconds.toString());
      return res.status(429).json({
        error: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      });
    }

    next();
  };
}
