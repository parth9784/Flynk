import type { ShareSession, ShareStatus } from "@prisma/client";
import { prisma } from "./prisma.js";

const TERMINAL_STATUSES: ShareStatus[] = ["completed", "expired", "revoked"];

/**
 * Returns the share's up-to-date status, lazily flipping it to "expired"
 * in the database if its expiry has passed but no background job has
 * caught it yet.
 */
export async function getEffectiveStatus(share: ShareSession): Promise<ShareStatus> {
  if (TERMINAL_STATUSES.includes(share.status)) {
    return share.status;
  }

  if (share.expiresAt < new Date()) {
    await prisma.shareSession.update({ where: { id: share.id }, data: { status: "expired" } });
    return "expired";
  }

  return share.status;
}
