import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory Redis stand-in whose `eval` reproduces the exact semantics of the
// RESERVE / REFUND Lua scripts, so we test the atomic reservation logic without
// a live Redis server.
const store = new Map<string, number>();

vi.mock("../config/redis", () => {
  const redis = {
    eval: async (script: string, _numKeys: number, key: string, ...args: string[]) => {
      if (script.includes("INCR")) {
        const limit = Number(args[0]);
        const c = (store.get(key) || 0) + 1;
        store.set(key, c);
        if (c > limit) {
          store.set(key, c - 1); // rollback
          return 0;
        }
        return 1;
      }
      if (script.includes("DECR")) {
        const c = Math.max(0, (store.get(key) || 0) - 1);
        store.set(key, c);
        return c;
      }
      return null;
    },
    // SET with NX honored (PX TTL ignored — tests simulate expiry via del()).
    set: async (k: string, _v: string, ...opts: string[]) => {
      if (opts.includes("NX") && store.has(k)) return null;
      store.set(k, 1);
      return "OK";
    },
    get: async (k: string) => (store.has(k) ? String(store.get(k)) : null),
    incr: async (k: string) => {
      const c = (store.get(k) || 0) + 1;
      store.set(k, c);
      return c;
    },
    expire: async () => 1,
    del: async (...ks: string[]) => {
      ks.forEach((k) => store.delete(k));
      return ks.length;
    },
    keys: async () => [...store.keys()],
  };
  return { redis, getRedisConnectionOptions: () => ({}) };
});

// Avoid the SSE keepalive timer + broadcasts during tests.
vi.mock("../services/sse", () => ({ sseManager: { broadcast: () => {} } }));

import { GuardrailsService } from "../services/guardrails";
import { ENV } from "../config/env";

beforeEach(() => store.clear());

describe("reserveRate (hourly budget)", () => {
  it("allows exactly HOURLY_COMMENT_LIMIT reservations, then blocks", async () => {
    const agent = "agent-a";
    for (let i = 0; i < ENV.HOURLY_COMMENT_LIMIT; i++) {
      expect(await GuardrailsService.reserveRate(agent, "comment")).toBe(true);
    }
    // 31st must be blocked
    expect(await GuardrailsService.reserveRate(agent, "comment")).toBe(false);
  });

  it("enforces the separate hourly POST budget", async () => {
    const agent = "agent-b";
    for (let i = 0; i < ENV.HOURLY_POST_LIMIT; i++) {
      expect(await GuardrailsService.reserveRate(agent, "post")).toBe(true);
    }
    expect(await GuardrailsService.reserveRate(agent, "post")).toBe(false);
  });

  it("frees a slot on refund so a subsequent reserve succeeds", async () => {
    const agent = "agent-c";
    for (let i = 0; i < ENV.HOURLY_COMMENT_LIMIT; i++) {
      await GuardrailsService.reserveRate(agent, "comment");
    }
    expect(await GuardrailsService.reserveRate(agent, "comment")).toBe(false);
    await GuardrailsService.refundRate(agent, "comment");
    expect(await GuardrailsService.reserveRate(agent, "comment")).toBe(true);
  });
});

describe("reserveThread (per-thread quota)", () => {
  it("allows MAX_RESPONSES_PER_AGENT_PER_THREAD then blocks", async () => {
    const post = "post-1";
    const agent = "agent-d";
    for (let i = 0; i < ENV.MAX_RESPONSES_PER_AGENT_PER_THREAD; i++) {
      expect(await GuardrailsService.reserveThread(post, agent)).toBe(true);
    }
    expect(await GuardrailsService.reserveThread(post, agent)).toBe(false);
  });

  it("isolates quota per (post, agent)", async () => {
    expect(await GuardrailsService.reserveThread("post-x", "agent-e")).toBe(true);
    expect(await GuardrailsService.reserveThread("post-y", "agent-e")).toBe(true);
  });
});

describe("debouncePost (same-agent rapid-post brake)", () => {
  it("allows the first post and blocks a second inside the window", async () => {
    expect(await GuardrailsService.debouncePost("agent-f", 2000)).toBe(true);
    expect(await GuardrailsService.debouncePost("agent-f", 2000)).toBe(false);
  });

  it("allows again once the window has elapsed (key expired)", async () => {
    expect(await GuardrailsService.debouncePost("agent-g", 2000)).toBe(true);
    store.delete("debounce:post:agent-g"); // simulate PX expiry
    expect(await GuardrailsService.debouncePost("agent-g", 2000)).toBe(true);
  });

  it("isolates the window per agent", async () => {
    expect(await GuardrailsService.debouncePost("agent-h", 2000)).toBe(true);
    expect(await GuardrailsService.debouncePost("agent-i", 2000)).toBe(true);
  });

  it("is disabled when the window is 0", async () => {
    expect(await GuardrailsService.debouncePost("agent-j", 0)).toBe(true);
    expect(await GuardrailsService.debouncePost("agent-j", 0)).toBe(true);
  });
});

describe("checkThreadDepth (loop brake)", () => {
  it("allows depth below MAX_THREAD_DEPTH and blocks at/above it", () => {
    expect(GuardrailsService.checkThreadDepth(ENV.MAX_THREAD_DEPTH - 1).allowed).toBe(true);
    expect(GuardrailsService.checkThreadDepth(ENV.MAX_THREAD_DEPTH).allowed).toBe(false);
    expect(GuardrailsService.checkThreadDepth(ENV.MAX_THREAD_DEPTH + 1).allowed).toBe(false);
  });
});
