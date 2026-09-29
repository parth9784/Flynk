export type Identity =
  | { type: "user"; userId: string }
  | { type: "anonymous"; sessionToken: string };

declare global {
  namespace Express {
    interface Request {
      identity?: Identity;
    }
  }
}

export {};
