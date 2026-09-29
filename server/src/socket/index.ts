import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  SOCKET_EVENTS,
  type AnswerPayload,
  type IceCandidatePayload,
  type JoinRoomAck,
  type JoinRoomPayload,
  type OfferPayload,
} from "@p2p/shared";
import type { ShareSession } from "@prisma/client";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { getAllowedOrigins } from "../lib/cors-origins.js";

interface SocketIdentity {
  type: "user" | "anonymous";
  userId?: string;
  sessionId?: string;
}

interface HandshakeAuth {
  accessToken?: string;
  sessionToken?: string;
}

async function resolveIdentity(auth: HandshakeAuth): Promise<SocketIdentity | null> {
  if (auth.accessToken) {
    try {
      const payload = verifyAccessToken(auth.accessToken);
      return { type: "user", userId: payload.sub };
    } catch {
      return null;
    }
  }

  if (auth.sessionToken) {
    const session = await prisma.anonymousSession.findUnique({ where: { sessionToken: auth.sessionToken } });
    if (!session || session.expiresAt < new Date()) return null;
    return { type: "anonymous", sessionId: session.id };
  }

  return null;
}

function isParticipant(identity: SocketIdentity, share: ShareSession): boolean {
  if (identity.type === "user") {
    return share.senderId === identity.userId || share.receiverId === identity.userId;
  }
  return share.senderSessionId === identity.sessionId || share.receiverSessionId === identity.sessionId;
}

export function setupSignaling(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: getAllowedOrigins() },
  });

  io.on("connection", (socket: Socket) => {
    socket.on(
      SOCKET_EVENTS.JOIN_ROOM,
      async ({ shareCode }: JoinRoomPayload, callback?: (ack: JoinRoomAck) => void) => {
        const identity = await resolveIdentity(socket.handshake.auth as HandshakeAuth);
        if (!identity) {
          return callback?.({ error: "UNAUTHENTICATED" });
        }

        const share = await prisma.shareSession.findUnique({ where: { shareCode } });
        if (!share) {
          return callback?.({ error: "NOT_FOUND" });
        }
        if (!isParticipant(identity, share)) {
          return callback?.({ error: "FORBIDDEN" });
        }

        socket.join(shareCode);
        socket.data.shareCode = shareCode;
        socket.to(shareCode).emit(SOCKET_EVENTS.PEER_JOINED, { socketId: socket.id });
        callback?.({ ok: true });
      },
    );

    socket.on(SOCKET_EVENTS.OFFER, ({ shareCode, offer }: OfferPayload) => {
      socket.to(shareCode).emit(SOCKET_EVENTS.OFFER, { offer, from: socket.id });
    });

    socket.on(SOCKET_EVENTS.ANSWER, ({ shareCode, answer }: AnswerPayload) => {
      socket.to(shareCode).emit(SOCKET_EVENTS.ANSWER, { answer, from: socket.id });
    });

    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, ({ shareCode, candidate }: IceCandidatePayload) => {
      socket.to(shareCode).emit(SOCKET_EVENTS.ICE_CANDIDATE, { candidate, from: socket.id });
    });

    socket.on("disconnect", () => {
      const shareCode = socket.data.shareCode as string | undefined;
      if (shareCode) {
        socket.to(shareCode).emit(SOCKET_EVENTS.PEER_LEFT, { socketId: socket.id });
      }
    });
  });

  return io;
}
