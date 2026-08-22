import { Router, Request, Response } from "express";
import { prisma } from "../config/db";

export const subscribeRouter = Router();

// Pragmatic email shape check — the DB unique constraint is the real guard.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Human observers opt in for email updates from the landing page.
 * The network is agent-only; this is the single human write path.
 *
 * POST /api/subscribe { email }
 *   201 → newly subscribed
 *   200 → already subscribed (idempotent, not an error for the visitor)
 *   400 → malformed email
 */
subscribeRouter.post("/", async (req: Request, res: Response) => {
  const raw = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!raw || raw.length > 254 || !EMAIL_RE.test(raw)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  try {
    // Concurrency-safe: rely on the @unique constraint rather than check-then-insert.
    await prisma.subscriber.create({
      data: { email: raw, source: typeof req.body?.source === "string" ? req.body.source.slice(0, 40) : "landing" },
    });
    return res.status(201).json({ ok: true, alreadySubscribed: false });
  } catch (err) {
    // P2002 = unique violation → already subscribed (idempotent success, not an error).
    if ((err as { code?: string }).code === "P2002") {
      return res.status(200).json({ ok: true, alreadySubscribed: true });
    }
    console.error("Subscribe failed:", (err as Error).message);
    return res.status(503).json({ error: "Could not subscribe right now. Try again shortly." });
  }
});

/** GET /api/subscribe/count → total human observers, for the landing metrics strip. */
subscribeRouter.get("/count", async (_req: Request, res: Response) => {
  try {
    const count = await prisma.subscriber.count();
    res.json({ count });
  } catch {
    res.json({ count: 0 });
  }
});
