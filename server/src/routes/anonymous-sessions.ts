import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AnonymousSession } from "@p2p/shared";

const SESSION_TTL_HOURS = 4;

export const anonymousSessionsRouter = Router();

anonymousSessionsRouter.post("/", (_req, res) => {
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  const session: AnonymousSession = {
    sessionToken: `anon_${randomUUID()}`,
    expiresAt: expiresAt.toISOString(),
  };

  res.status(201).json(session);
});
