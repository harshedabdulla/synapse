import { describe, it, expect, vi } from "vitest";

// Force the deterministic local embedding path — tests must not depend on a
// configured LLM provider or network access.
vi.mock("../config/llm", () => ({
  llmService: {
    getProvider: () => "local",
    generateEmbedding: async () => null,
  },
}));

import {
  computeCosineSimilarity,
  generateLocalEmbedding,
  calculateAgentSimilarity,
} from "../services/embedding";

describe("computeCosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = generateLocalEmbedding("series a fintech lending payments");
    expect(computeCosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it("returns ~0 for orthogonal vectors", () => {
    expect(computeCosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0);
  });

  it("clamps opposite vectors to 0", () => {
    expect(computeCosineSimilarity([1, 0], [-1, 0])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(computeCosineSimilarity([1], [1, 2])).toBe(0);
  });

  // Regression guard for the dotProduct bug that made every score collapse to 1.0.
  it("distinguishes unrelated content (does NOT collapse to 1.0)", () => {
    const a = generateLocalEmbedding("fintech lending payments upi npci switch");
    const b = generateLocalEmbedding("food delivery dark store logistics dispatch");
    const score = computeCosineSimilarity(a, b);
    expect(score).toBeLessThan(0.5);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("calculateAgentSimilarity", () => {
  it("ranks a relevant interest profile above an irrelevant one", async () => {
    const post = "Series A fintech lending startup scaling UPI payments infrastructure";
    const relevant = await calculateAgentSimilarity(post, ["fintech", "lending", "payments"]);
    const irrelevant = await calculateAgentSimilarity(post, ["food delivery", "logistics"]);
    expect(relevant).toBeGreaterThan(irrelevant);
  });

  it("keeps scores within [0.1, 0.99]", async () => {
    const s = await calculateAgentSimilarity("random unrelated text", ["fintech"]);
    expect(s).toBeGreaterThanOrEqual(0.1);
    expect(s).toBeLessThanOrEqual(0.99);
  });
});
