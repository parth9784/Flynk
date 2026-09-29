import type { NextFunction, Request, Response } from "express";
import { redis } from "../lib/redis.js";
import { hashIp } from "../lib/ip-hash.js";

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
    const ipHash = hashIp(req);
    const key = `${keyPrefix}:${ipHash}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (count > max) {
      const ttl = await redis.ttl(key);
      res.setHeader("Retry-After", Math.max(ttl, 1).toString());
      return res.status(429).json({
        error: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      });
    }

    next();
  };
}
