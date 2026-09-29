import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AnonymousSession } from "@p2p/shared";
import { prisma } from "../lib/prisma.js";
import { hashIp } from "../lib/ip-hash.js";
import { rateLimit } from "../middleware/rate-limit.js";

const SESSION_TTL_HOURS = Number(process.env.ANONYMOUS_SESSION_TTL_HOURS ?? 4);

export const anonymousSessionsRouter = Router();

anonymousSessionsRouter.post(
  "/",
  rateLimit({ keyPrefix: "rl:anon-session", max: 20, windowSeconds: 60 * 60 }),
  async (req, res) => {
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
    const sessionToken = `anon_${randomUUID()}`;

    await prisma.anonymousSession.create({
      data: {
        sessionToken,
        ipHash: hashIp(req),
        expiresAt,
      },
    });

    const session: AnonymousSession = {
      sessionToken,
      expiresAt: expiresAt.toISOString(),
    };

    res.status(201).json(session);
  },
);
