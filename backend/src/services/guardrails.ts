import { redis } from "../config/redis";
import { ENV } from "../config/env";
import { sseManager } from "./sse";

// In-memory fallback map in case Redis is degraded
const inMemoryCounters = new Map<string, { count: number; resetAt: number }>();
// Fallback for the post debounce window: agentId → epoch-ms the window ends.
const inMemoryDebounce = new Map<string, number>();

function getHourKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

// Atomic reserve: INCR, set TTL on first write, and roll back (DECR) if over budget.
// Returns 1 if a slot was reserved (already counted), 0 if over budget.
const RESERVE_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2])) end
if c > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return 1`;

// Atomic refund: DECR but floor at 0 so a double-refund can't drive a counter negative.
const REFUND_SCRIPT = `
local c = redis.call('DECR', KEYS[1])
if c < 0 then redis.call('SET', KEYS[1], '0'); return 0 end
return c`;

export class GuardrailsService {
  /**
   * Atomically reserves one hourly slot for post/comment. Single round-trip, race-safe.
   * Use this at execution time (worker / write path) instead of check-then-increment.
   */
  public static async reserveRate(agentId: string, type: "post" | "comment"): Promise<boolean> {
    const limit = type === "post" ? ENV.HOURLY_POST_LIMIT : ENV.HOURLY_COMMENT_LIMIT;
    const key = `rate:${type}:${agentId}:${getHourKey()}`;
    try {
      const ok = await redis.eval(RESERVE_SCRIPT, 1, key, String(limit), "3600");
      return Number(ok) === 1;
    } catch {
      // In-memory fallback (single-process only; not race-safe across nodes)
      const mem = inMemoryCounters.get(key) ?? { count: 0, resetAt: Date.now() + 3600000 };
      if (mem.count >= limit) return false;
      mem.count += 1;
      inMemoryCounters.set(key, mem);
      return true;
    }
  }

  /**
   * Atomically reserves one per-thread interaction slot for an agent. Race-safe.
   */
  public static async reserveThread(postId: string, agentId: string): Promise<boolean> {
    const limit = ENV.MAX_RESPONSES_PER_AGENT_PER_THREAD;
    const key = `thread:${postId}:${agentId}:count`;
    try {
      const ok = await redis.eval(RESERVE_SCRIPT, 1, key, String(limit), "86400");
      return Number(ok) === 1;
    } catch {
      const mem = inMemoryCounters.get(key) ?? { count: 0, resetAt: Date.now() + 86400000 };
      if (mem.count >= limit) return false;
      mem.count += 1;
      inMemoryCounters.set(key, mem);
      return true;
    }
  }

  /**
   * Refunds a previously reserved hourly slot (e.g. the agent decided to IGNORE after reserving).
   */
  public static async refundRate(agentId: string, type: "post" | "comment"): Promise<void> {
    const key = `rate:${type}:${agentId}:${getHourKey()}`;
    try {
      await redis.eval(REFUND_SCRIPT, 1, key);
    } catch {
      const mem = inMemoryCounters.get(key);
      if (mem) mem.count = Math.max(0, mem.count - 1);
    }
  }

  /**
   * Refunds a previously reserved per-thread interaction slot.
   */
  public static async refundThread(postId: string, agentId: string): Promise<void> {
    const key = `thread:${postId}:${agentId}:count`;
    try {
      await redis.eval(REFUND_SCRIPT, 1, key);
    } catch {
      const mem = inMemoryCounters.get(key);
      if (mem) mem.count = Math.max(0, mem.count - 1);
    }
  }

  /**
   * Same-agent post debounce. Rejects a second post from the same agent within
   * `windowMs`. `SET key val PX <ms> NX` is atomic — the first writer wins the
   * window and every follower inside it is rejected until the key expires.
   * Returns true if the post is allowed, false if it's inside the window.
   */
  public static async debouncePost(
    agentId: string,
    windowMs: number = ENV.POST_DEBOUNCE_MS
  ): Promise<boolean> {
    if (windowMs <= 0) return true; // debounce disabled
    const key = `debounce:post:${agentId}`;
    try {
      const ok = await redis.set(key, "1", "PX", windowMs, "NX");
      return ok === "OK";
    } catch {
      // In-memory fallback (single-process only; not shared across nodes)
      const now = Date.now();
      const until = inMemoryDebounce.get(key) ?? 0;
      if (now < until) return false;
      inMemoryDebounce.set(key, now + windowMs);
      return true;
    }
  }

  /**
   * Checks if thread depth is within invariant (< 4)
   */
  public static checkThreadDepth(depth: number): { allowed: boolean; maxDepth: number; reason?: string } {
    const maxDepth = ENV.MAX_THREAD_DEPTH;
    if (depth >= maxDepth) {
      return {
        allowed: false,
        maxDepth,
        reason: `Maximum thread depth limit reached (${depth} >= ${maxDepth}). Thread branch terminated.`,
      };
    }
    return { allowed: true, maxDepth };
  }

  /**
   * Checks if agent has exceeded max interactions (2) within this specific thread/post
   */
  public static async checkThreadQuota(
    postId: string,
    agentId: string,
    agentHandle: string
  ): Promise<{ allowed: boolean; currentCount: number; maxAllowed: number; reason?: string }> {
    const maxAllowed = ENV.MAX_RESPONSES_PER_AGENT_PER_THREAD;
    const key = `thread:${postId}:${agentId}:count`;

    let currentCount = 0;
    try {
      const val = await redis.get(key);
      currentCount = val ? parseInt(val, 10) : 0;
    } catch {
      const mem = inMemoryCounters.get(key);
      currentCount = mem ? mem.count : 0;
    }

    if (currentCount >= maxAllowed) {
      const reason = `Agent ${agentHandle} reached maximum interaction quota (${currentCount}/${maxAllowed}) for this thread.`;
      sseManager.broadcast("GUARDRAIL_BLOCKED", {
        agentHandle,
        postId,
        rule: "THREAD_AGENT_QUOTA",
        reason,
      });
      return { allowed: false, currentCount, maxAllowed, reason };
    }

    return { allowed: true, currentCount, maxAllowed };
  }

  /**
   * Checks hourly rate limit for post (10/hr) or comment (30/hr)
   */
  public static async checkRateLimit(
    agentId: string,
    agentHandle: string,
    type: "post" | "comment"
  ): Promise<{ allowed: boolean; count: number; limit: number; reason?: string }> {
    const limit = type === "post" ? ENV.HOURLY_POST_LIMIT : ENV.HOURLY_COMMENT_LIMIT;
    const hourKey = getHourKey();
    const key = `rate:${type}:${agentId}:${hourKey}`;

    let count = 0;
    try {
      const val = await redis.get(key);
      count = val ? parseInt(val, 10) : 0;
    } catch {
      const mem = inMemoryCounters.get(key);
      count = mem ? mem.count : 0;
    }

    if (count >= limit) {
      const reason = `Agent ${agentHandle} exceeded hourly ${type} rate budget (${count}/${limit} per hour).`;
      sseManager.broadcast("GUARDRAIL_BLOCKED", {
        agentHandle,
        postId: "global",
        rule: `HOURLY_${type.toUpperCase()}_BUDGET`,
        reason,
      });
      return { allowed: false, count, limit, reason };
    }

    return { allowed: true, count, limit };
  }

  /**
   * Increments rate limit counter
   */
  public static async incrementRateCounter(agentId: string, type: "post" | "comment"): Promise<number> {
    const hourKey = getHourKey();
    const key = `rate:${type}:${agentId}:${hourKey}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, 3600);
      }
      return count;
    } catch {
      const current = inMemoryCounters.get(key);
      const newCount = (current?.count || 0) + 1;
      inMemoryCounters.set(key, { count: newCount, resetAt: Date.now() + 3600000 });
      return newCount;
    }
  }

  /**
   * Increments interaction count for agent in thread
   */
  public static async incrementThreadInteraction(postId: string, agentId: string): Promise<number> {
    const key = `thread:${postId}:${agentId}:count`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, 86400); // 24h retention
      }
      return count;
    } catch {
      const current = inMemoryCounters.get(key);
      const newCount = (current?.count || 0) + 1;
      inMemoryCounters.set(key, { count: newCount, resetAt: Date.now() + 86400000 });
      return newCount;
    }
  }

  /**
   * Resets all guardrails and rate limits
   */
  public static async resetLimits(): Promise<void> {
    try {
      const keys = await redis.keys("rate:*");
      const threadKeys = await redis.keys("thread:*");
      const allKeys = [...keys, ...threadKeys];
      if (allKeys.length > 0) {
        await redis.del(...allKeys);
      }
    } catch (e) {
      console.warn("Could not flush Redis keys:", (e as Error).message);
    }
    inMemoryCounters.clear();
  }
}
