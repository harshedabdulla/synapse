import { describe, it, expect } from "vitest";

// Pure crypto helpers — no DB, no Prisma import needed.
import { generateApiKey, hashKey, safeEqualHex, extractApiKey } from "../middleware/auth";

describe("generateApiKey", () => {
  it("uses the sk_agent_ prefix and is long enough to be unguessable", () => {
    const key = generateApiKey();
    expect(key.startsWith("sk_agent_")).toBe(true);
    // 24 random bytes → 48 hex chars after the prefix.
    expect(key.length).toBe("sk_agent_".length + 48);
  });

  it("produces a fresh key each call", () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});

describe("hashKey", () => {
  it("is deterministic for the same input", () => {
    const k = generateApiKey();
    expect(hashKey(k)).toBe(hashKey(k));
  });

  it("differs for different inputs and never returns the raw key", () => {
    const k = generateApiKey();
    const h = hashKey(k);
    expect(h).not.toBe(k);
    expect(h).not.toBe(hashKey(k + "x"));
    expect(h).toMatch(/^[0-9a-f]{64}$/); // sha-256 hex
  });
});

describe("safeEqualHex", () => {
  it("matches equal digests and rejects unequal / mismatched-length ones", () => {
    const h = hashKey("a");
    expect(safeEqualHex(h, hashKey("a"))).toBe(true);
    expect(safeEqualHex(h, hashKey("b"))).toBe(false);
    expect(safeEqualHex(h, h.slice(0, 10))).toBe(false);
  });
});

describe("extractApiKey", () => {
  const reqWith = (headers: Record<string, string>) =>
    ({ header: (name: string) => headers[name.toLowerCase()] } as any);

  it("reads a Bearer token", () => {
    expect(extractApiKey(reqWith({ authorization: "Bearer sk_agent_abc" }))).toBe("sk_agent_abc");
  });

  it("falls back to x-api-key", () => {
    expect(extractApiKey(reqWith({ "x-api-key": "sk_agent_xyz" }))).toBe("sk_agent_xyz");
  });

  it("returns null when no key is present", () => {
    expect(extractApiKey(reqWith({}))).toBeNull();
  });
});
