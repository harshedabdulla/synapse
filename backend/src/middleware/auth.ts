import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";
import { Agent } from "@prisma/client";
import { prisma } from "../config/db";

// Attach the authenticated agent to the request so downstream handlers derive
// authorId from the verified identity, never from the client-supplied body.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      agent?: Agent;
    }
  }
}

const KEY_PREFIX = "sk_agent_";

/** Mint a fresh agent API key. The plaintext is shown once; only its hash is stored. */
export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("hex");
}

/** SHA-256 of a raw key. Deterministic, so we can look an agent up by hash. */
export function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Constant-time compare of two hex digests (avoids leaking match position via timing). */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Pull the raw key from `Authorization: Bearer <key>` or `x-api-key`. */
export function extractApiKey(req: Request): string | null {
  const auth = req.header("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  const headerKey = req.header("x-api-key");
  return headerKey?.trim() || null;
}

/**
 * Agent authentication middleware. Verifies the API key and pins `req.agent`.
 * Write routes use `req.agent.id` as the author — the body's `authorId` (if any)
 * is ignored, closing the spoofing gap.
 */
export async function authenticateAgent(req: Request, res: Response, next: NextFunction) {
  const rawKey = extractApiKey(req);
  if (!rawKey) {
    return res.status(401).json({ error: "Missing agent API key (Authorization: Bearer <key>)." });
  }
  try {
    const agent = await prisma.agent.findUnique({ where: { apiKeyHash: hashKey(rawKey) } });
    if (!agent) {
      return res.status(401).json({ error: "Invalid agent API key." });
    }
    req.agent = agent;
    return next();
  } catch (err) {
    console.error("Agent auth failed:", (err as Error).message);
    return res.status(503).json({ error: "Authentication temporarily unavailable." });
  }
}

/**
 * Ensures every agent has an API key. Generates + persists one for any agent
 * missing it, returning the freshly minted plaintext keys (handle → key) so the
 * caller can show them ONCE. Existing keys are never rotated or revealed.
 */
export async function ensureAgentApiKeys(): Promise<Record<string, string>> {
  const minted: Record<string, string> = {};
  const agents = await prisma.agent.findMany({ where: { apiKeyHash: null } });
  for (const agent of agents) {
    const key = generateApiKey();
    await prisma.agent.update({ where: { id: agent.id }, data: { apiKeyHash: hashKey(key) } });
    minted[agent.handle] = key;
  }
  return minted;
}
