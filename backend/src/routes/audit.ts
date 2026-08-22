import { Router, Request, Response } from "express";
import { prisma } from "../config/db";
import { GuardrailsService } from "../services/guardrails";
import { redis } from "../config/redis";
import { sseManager } from "../services/sse";

export const auditRouter = Router();

/**
 * GET /api/audit-logs - Retrieve recent audit logs
 */
auditRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 50,
      include: {
        agent: true,
        post: {
          select: {
            id: true,
            content: true,
          },
        },
      },
    });

    return res.json(logs);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

/**
 * GET /api/stats - High-level system telemetry
 */
auditRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [postsCount, commentsCount, reactionsCount, agentsCount, auditLogs] = await Promise.all([
      prisma.post.count(),
      prisma.comment.count(),
      prisma.reaction.count(),
      prisma.agent.count(),
      prisma.auditLog.findMany({
        orderBy: { timestamp: "desc" },
        take: 100,
        select: {
          latencyMs: true,
          tokensUsed: true,
          action: true,
        },
      }),
    ]);

    const totalTokens = auditLogs.reduce((acc, l) => acc + l.tokensUsed, 0);
    const avgLatency =
      auditLogs.length > 0
        ? Math.round(auditLogs.reduce((acc, l) => acc + l.latencyMs, 0) / auditLogs.length)
        : 0;

    // Cache hit ratio from the read-through feed counters (best-effort).
    let cacheHitRatio = 0;
    try {
      const [hit, miss] = await Promise.all([
        redis.get("metrics:cache:hit"),
        redis.get("metrics:cache:miss"),
      ]);
      const h = hit ? parseInt(hit, 10) : 0;
      const m = miss ? parseInt(miss, 10) : 0;
      cacheHitRatio = h + m > 0 ? h / (h + m) : 0;
    } catch {
      // Redis degraded — leave ratio at 0
    }

    return res.json({
      postsCount,
      commentsCount,
      reactionsCount,
      agentsCount,
      totalTokens,
      avgLatencyMs: avgLatency,
      cacheHitRatio,
      connectedSSEClients: sseManager.getConnectedClientsCount(),
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

/**
 * POST /api/reset - Flushes posts, comments, reactions, audit logs, and redis counters for a fresh demo run
 */
auditRouter.post("/reset", async (_req: Request, res: Response) => {
  try {
    // Delete posts (cascades to comments, reactions, audit logs)
    await prisma.post.deleteMany({});
    await prisma.auditLog.deleteMany({});
    
    // Clear Redis & Guardrails
    await GuardrailsService.resetLimits();
    try {
      await redis.del("feed:global", "metrics:cache:hit", "metrics:cache:miss");
    } catch (e) {
      // ignore
    }

    sseManager.clearHistory();
    sseManager.broadcast("FEED_UPDATED", { eventType: "FEED_RESET", timestamp: new Date().toISOString() });

    console.log("🧹 System reset: All posts, comments, and telemetry flushed.");

    return res.json({ success: true, message: "System state reset successfully." });
  } catch (error) {
    console.error("Error resetting system:", error);
    return res.status(500).json({ error: "Failed to reset system" });
  }
});
