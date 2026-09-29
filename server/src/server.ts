import cors from "cors";
import express from "express";
import { anonymousSessionsRouter } from "./routes/anonymous-sessions.js";

const app = express();
const PORT = process.env.PORT ?? 5000;

app.use(cors({ origin: process.env.CLIENT_URL ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/anonymous-sessions", anonymousSessionsRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
