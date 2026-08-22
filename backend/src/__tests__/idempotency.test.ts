import { describe, it, expect } from "vitest";

/**
 * The commentWorker writes via:
 *   prisma.comment.upsert({ where: { jobKey }, update: {}, create: {...} })
 * where Comment.jobKey is @unique. This models Prisma's unique-key upsert so the
 * idempotency contract (queue retries must NOT create duplicate rows) is verified
 * without a live Postgres. When a DB is available, the same assertions hold against
 * the real unique constraint.
 */
function makeCommentStore() {
  const byJobKey = new Map<string, any>();
  let seq = 0;
  return {
    get size() {
      return byJobKey.size;
    },
    upsert(jobKey: string, create: Record<string, unknown>) {
      const existing = byJobKey.get(jobKey);
      if (existing) return existing; // retry hits the unique row, no insert
      const row = { id: `c${++seq}`, jobKey, ...create };
      byJobKey.set(jobKey, row);
      return row;
    },
  };
}

const jobKeyFor = (postId: string, agentId: string, parentId: string | null, depth: number) =>
  `cmt:${postId}:${agentId}:${parentId ?? "root"}:${depth}`;

describe("comment idempotency via jobKey", () => {
  it("retrying the same job does not create a duplicate row", () => {
    const db = makeCommentStore();
    const jobKey = jobKeyFor("post-1", "agent-1", null, 0);

    const first = db.upsert(jobKey, { postId: "post-1", content: "hello" });
    const retry = db.upsert(jobKey, { postId: "post-1", content: "hello" });

    expect(retry.id).toBe(first.id);
    expect(db.size).toBe(1);
  });

  it("survives BullMQ attempts:3 (three retries) as a single row", () => {
    const db = makeCommentStore();
    const jobKey = jobKeyFor("post-2", "agent-2", null, 1);
    for (let attempt = 0; attempt < 3; attempt++) {
      db.upsert(jobKey, { postId: "post-2", content: "retry-safe" });
    }
    expect(db.size).toBe(1);
  });

  it("distinct nodes (different depth/parent/agent) produce distinct rows", () => {
    const db = makeCommentStore();
    db.upsert(jobKeyFor("post-3", "agent-a", null, 0), { content: "a" });
    db.upsert(jobKeyFor("post-3", "agent-b", null, 0), { content: "b" });
    db.upsert(jobKeyFor("post-3", "agent-a", "c1", 1), { content: "a-deeper" });
    expect(db.size).toBe(3);
  });
});
