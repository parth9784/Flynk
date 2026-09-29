import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { CreateShareResponse, JoinShareResponse, ShareDetails } from "@p2p/shared";
import { prisma } from "../lib/prisma.js";
import { generateShareCode } from "../lib/share-code.js";
import { getEffectiveStatus } from "../lib/share-lifecycle.js";
import { asyncHandler } from "../lib/async-handler.js";
import { identify } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { hashIp } from "../lib/ip-hash.js";

export const sharesRouter = Router();

const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB ?? 1024);
const MAX_ANONYMOUS_FILE_SIZE_MB = Number(process.env.MAX_ANONYMOUS_FILE_SIZE_MB ?? 500);
const MAX_FILES_PER_TRANSFER = Number(process.env.MAX_FILES_PER_TRANSFER ?? 20);
const SHARE_EXPIRY_MINUTES = Number(process.env.SHARE_EXPIRY_MINUTES ?? 15);
const MAX_SHARE_JOIN_ATTEMPTS = 20;

const bytesFor = (mb: number) => mb * 1024 * 1024;

const createShareSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        size: z.number().int().positive(),
        mimeType: z.string().min(1).max(255),
      }),
    )
    .min(1),
});

function shareCreationMax(identity: Express.Request["identity"]): number {
  return identity?.type === "user" ? 100 : 20;
}

// -- Create share -----------------------------------------------------------

sharesRouter.post(
  "/",
  identify,
  asyncHandler(async (req, res) => {
    const rateLimitResult = await checkRateLimit(
      `rl:create-share:${hashIp(req)}`,
      shareCreationMax(req.identity),
      60 * 60,
    );
    if (!rateLimitResult.allowed) {
      res.setHeader("Retry-After", rateLimitResult.retryAfterSeconds.toString());
      return res.status(429).json({ error: "RATE_LIMITED", message: "Too many shares created. Try again later." });
    }

    const parsed = createShareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_INPUT", message: parsed.error.message });
    }
    const { files } = parsed.data;

    if (files.length > MAX_FILES_PER_TRANSFER) {
      return res.status(400).json({
        error: "TOO_MANY_FILES",
        message: `A share may contain at most ${MAX_FILES_PER_TRANSFER} files.`,
      });
    }

    const totalSizeBytes = files.reduce((sum, f) => sum + f.size, 0);

    if (totalSizeBytes > bytesFor(MAX_FILE_SIZE_MB)) {
      return res.status(400).json({
        error: "FILE_TOO_LARGE",
        message: `Total share size exceeds the ${MAX_FILE_SIZE_MB} MB limit.`,
      });
    }

    const requiresAuth = totalSizeBytes > bytesFor(MAX_ANONYMOUS_FILE_SIZE_MB);
    if (requiresAuth && req.identity?.type !== "user") {
      return res.status(401).json({
        error: "LOGIN_REQUIRED",
        message: `Files over ${MAX_ANONYMOUS_FILE_SIZE_MB} MB require an account.`,
        maxAnonymousSizeMb: MAX_ANONYMOUS_FILE_SIZE_MB,
      });
    }

    const expiresAt = new Date(Date.now() + SHARE_EXPIRY_MINUTES * 60 * 1000);

    const identity = req.identity!;
    const senderFields =
      identity.type === "user"
        ? { senderId: identity.userId }
        : { senderSessionId: identity.sessionId };

    let share;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        share = await prisma.shareSession.create({
          data: {
            shareCode: generateShareCode(),
            totalSizeBytes,
            requiresAuth,
            expiresAt,
            ...senderFields,
            files: {
              create: files.map((f) => ({ filename: f.name, size: f.size, mimeType: f.mimeType })),
            },
          },
        });
        break;
      } catch (err) {
        const isUniqueCodeClash =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          (err.meta?.target as string[] | undefined)?.includes("share_code");
        if (!isUniqueCodeClash) throw err;
      }
    }

    if (!share) {
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Could not allocate a share code." });
    }

    const response: CreateShareResponse = {
      shareId: share.id,
      shareCode: share.shareCode,
      expiresAt: share.expiresAt.toISOString(),
      requiresAuth: share.requiresAuth,
    };
    res.status(201).json(response);
  }),
);

// -- Lookup share by code -----------------------------------------------------

sharesRouter.get(
  "/:shareCode",
  asyncHandler(async (req, res) => {
    const rateLimitResult = await checkRateLimit(`rl:share-lookup:${hashIp(req)}`, 10, 60);
    if (!rateLimitResult.allowed) {
      res.setHeader("Retry-After", rateLimitResult.retryAfterSeconds.toString());
      return res.status(429).json({ error: "RATE_LIMITED", message: "Too many attempts. Try again later." });
    }

    const share = await prisma.shareSession.findUnique({
      where: { shareCode: req.params.shareCode.toUpperCase() },
      include: { files: true },
    });
    if (!share) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Share not found." });
    }

    let status = await getEffectiveStatus(share);

    if (status === "pending" || status === "active") {
      const joinAttempts = share.joinAttempts + 1;
      if (joinAttempts > MAX_SHARE_JOIN_ATTEMPTS) {
        await prisma.shareSession.update({ where: { id: share.id }, data: { status: "revoked", joinAttempts } });
        status = "revoked";
      } else {
        await prisma.shareSession.update({ where: { id: share.id }, data: { joinAttempts } });
      }
    }

    const response: ShareDetails = {
      shareId: share.id,
      shareCode: share.shareCode,
      status,
      expiresAt: share.expiresAt.toISOString(),
      files: share.files.map((f) => ({
        id: f.id,
        filename: f.filename,
        size: Number(f.size),
        mimeType: f.mimeType,
      })),
    };
    res.json(response);
  }),
);

// -- Join share ---------------------------------------------------------------

sharesRouter.post(
  "/:shareCode/join",
  identify,
  asyncHandler(async (req, res) => {
    const rateLimitResult = await checkRateLimit(`rl:share-join:${hashIp(req)}`, 10, 60);
    if (!rateLimitResult.allowed) {
      res.setHeader("Retry-After", rateLimitResult.retryAfterSeconds.toString());
      return res.status(429).json({ error: "RATE_LIMITED", message: "Too many attempts. Try again later." });
    }

    const share = await prisma.shareSession.findUnique({
      where: { shareCode: req.params.shareCode.toUpperCase() },
    });
    if (!share) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Share not found." });
    }

    const status = await getEffectiveStatus(share);
    if (status === "expired" || status === "revoked") {
      return res.status(410).json({ error: "SHARE_UNAVAILABLE", message: `This share is ${status}.` });
    }
    if (status !== "pending") {
      return res.status(409).json({ error: "ALREADY_JOINED", message: "This share already has a receiver." });
    }

    const identity = req.identity!;
    const receiverFields =
      identity.type === "user"
        ? { receiverId: identity.userId }
        : { receiverSessionId: identity.sessionId };

    const updated = await prisma.shareSession.update({
      where: { id: share.id },
      data: { ...receiverFields, status: "active" },
    });

    const response: JoinShareResponse = { shareId: updated.id, status: updated.status };
    res.json(response);
  }),
);
