export type Identity =
  | { type: "user"; userId: string }
  | { type: "anonymous"; sessionId: string; sessionToken: string };

declare global {
  namespace Express {
    interface Request {
      identity?: Identity;
    }
  }
}

export {};
