import express from "express";
import cors from "cors";
import { ENV } from "./config/env";
import { postsRouter } from "./routes/posts";
import { agentsRouter } from "./routes/agents";
import { streamRouter } from "./routes/stream";
import { auditRouter } from "./routes/audit";
import { simulationRouter } from "./routes/simulation";
import { subscribeRouter } from "./routes/subscribe";
import { startDiscoveryWorker } from "./queues/discoveryWorker";
import { startCommentWorker } from "./queues/commentWorker";
import { prisma } from "./config/db";
import { INITIAL_AGENTS } from "./config/seedData";
import { ensureAgentApiKeys } from "./middleware/auth";

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/posts", postsRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/stream", streamRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/simulation", simulationRouter);
app.use("/api/subscribe", subscribeRouter);

// Healthcheck
app.get("/health", async (_req, res) => {
  res.json({
    status: "ok",
    service: "agent-social-network-backend",
    llmProvider: process.env.GEMINI_API_KEY ? "gemini" : process.env.OPENAI_API_KEY ? "openai" : "local",
    timestamp: new Date().toISOString(),
  });
});

// Auto-bootstrap seed agents on startup
async function bootstrapAgents() {
  try {
    const count = await prisma.agent.count();
    if (count === 0) {
      console.log("🌱 Auto-seeding initial enterprise agents...");
      for (const agentData of INITIAL_AGENTS) {
        await prisma.agent.upsert({
          where: { handle: agentData.handle },
          update: agentData,
          create: agentData,
        });
      }
      console.log("✅ Initial 6 agents seeded successfully.");
    }
    // Ensure every agent has an API key (needed for authenticated agent writes).
    const minted = await ensureAgentApiKeys();
    const entries = Object.entries(minted);
    if (entries.length > 0) {
      console.log("🔑 Minted agent API keys (shown once):");
      for (const [handle, key] of entries) console.log(`   ${handle.padEnd(16)} ${key}`);
    }
  } catch (err) {
    console.warn("⚠️ Could not auto-seed agents (schema might need migration):", (err as Error).message);
  }
}

let discoveryWorkerInstance: any = null;
let commentWorkerInstance: any = null;

try {
  discoveryWorkerInstance = startDiscoveryWorker();
  commentWorkerInstance = startCommentWorker();
  console.log("🛠️ BullMQ Background Workers initialized successfully.");
} catch (e) {
  console.warn("⚠️ Could not initialize BullMQ workers (Redis may be offline):", (e as Error).message);
}

const server = app.listen(ENV.PORT, async () => {
  console.log(`🚀 Autonomous Agent Social Network API live on port ${ENV.PORT}`);
  console.log(`📡 SSE Stream available at http://localhost:${ENV.PORT}/api/stream`);
  await bootstrapAgents();
});

// Graceful shutdown
const shutdown = async () => {
  console.log("🛑 Shutting down gracefully...");
  if (discoveryWorkerInstance) await discoveryWorkerInstance.close();
  if (commentWorkerInstance) await commentWorkerInstance.close();
  await prisma.$disconnect();
  server.close(() => {
    console.log("👋 Server stopped.");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
