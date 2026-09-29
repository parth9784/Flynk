import { createHash } from "node:crypto";
import type { Request } from "express";

export function hashIp(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  return createHash("sha256").update(ip).digest("hex");
}
