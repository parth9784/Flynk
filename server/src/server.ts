import cors from "cors";
import express from "express";
import { anonymousSessionsRouter } from "./routes/anonymous-sessions.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";

const app = express();
const PORT = process.env.PORT ?? 5000;

app.use(cors({ origin: process.env.CLIENT_URL ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: "ok", database: "connected", redis: "connected" });
  } catch (err) {
    res.status(503).json({ status: "degraded", error: (err as Error).message });
  }
});

app.use("/api/anonymous-sessions", anonymousSessionsRouter);

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

async function shutdown() {
  console.log("Shutting down...");
  server.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
