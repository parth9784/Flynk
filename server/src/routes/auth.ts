import { Router } from "express";
import { z } from "zod";
import type { LoginResponse, PublicUser } from "@p2p/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signAccessToken } from "../lib/jwt.js";
import { generateRefreshToken, hashToken } from "../lib/refresh-token.js";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_INPUT", message: parsed.error.message });
    }
    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "EMAIL_TAKEN", message: "An account with this email already exists." });
    }

    const user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    });

    const publicUser: PublicUser = { id: user.id, name: user.name, email: user.email };
    res.status(201).json(publicUser);
  }),
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_INPUT", message: parsed.error.message });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    const passwordValid = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordValid) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Email or password is incorrect." });
    }

    const accessToken = signAccessToken(user.id);
    const refresh = generateRefreshToken();
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
    });

    const response: LoginResponse = {
      accessToken,
      refreshToken: refresh.token,
      user: { id: user.id, name: user.name, email: user.email },
    };
    res.json(response);
  }),
);

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_INPUT", message: parsed.error.message });
    }

    const tokenHash = hashToken(parsed.data.refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: "INVALID_REFRESH_TOKEN", message: "Refresh token is invalid or expired." });
    }

    // Rotate: revoke the used token and issue a new one, so a stolen refresh
    // token can't be replayed indefinitely.
    const newRefresh = generateRefreshToken();
    await prisma.$transaction([
      prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.create({
        data: { userId: stored.userId, tokenHash: newRefresh.tokenHash, expiresAt: newRefresh.expiresAt },
      }),
    ]);

    res.json({
      accessToken: signAccessToken(stored.userId),
      refreshToken: newRefresh.token,
    });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (parsed.success) {
      const tokenHash = hashToken(parsed.data.refreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.status(204).send();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    // requireAuth guarantees req.identity is set with type "user"
    const { userId } = req.identity as { type: "user"; userId: string };
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found." });
    }
    const publicUser: PublicUser = { id: user.id, name: user.name, email: user.email };
    res.json(publicUser);
  }),
);
