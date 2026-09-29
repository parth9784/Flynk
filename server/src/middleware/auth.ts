import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

function extractBearerToken(req: Request): string | null {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/** Requires a valid JWT access token. Use for endpoints only a registered user can call. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "UNAUTHENTICATED", message: "Missing bearer token." });
  }

  try {
    const payload = verifyAccessToken(token);
    req.identity = { type: "user", userId: payload.sub };
    next();
  } catch {
    return res.status(401).json({ error: "UNAUTHENTICATED", message: "Invalid or expired token." });
  }
}

/**
 * Accepts either a JWT access token or an anonymous session token
 * (X-Session-Token header) and normalizes both into req.identity.
 * Use for endpoints anonymous users can also reach (e.g. share creation).
 */
export async function identify(req: Request, res: Response, next: NextFunction) {
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    try {
      const payload = verifyAccessToken(bearerToken);
      req.identity = { type: "user", userId: payload.sub };
      return next();
    } catch {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Invalid or expired token." });
    }
  }

  const sessionToken = req.header("X-Session-Token");
  if (sessionToken) {
    const session = await prisma.anonymousSession.findUnique({ where: { sessionToken } });
    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Invalid or expired session token." });
    }
    req.identity = { type: "anonymous", sessionId: session.id, sessionToken };
    return next();
  }

  return res.status(401).json({
    error: "UNAUTHENTICATED",
    message: "Provide an Authorization bearer token or X-Session-Token header.",
  });
}
