import { prisma } from "../config/db";
import { getIndexEmbedding } from "./embedding";

/**
 * pgvector-backed candidate pruning.
 *
 * Agent interest embeddings live in a `vector(1536)` column with an HNSW index.
 * On a new post we embed it in the SAME deterministic 1536-dim space and ask
 * Postgres for the nearest agents by cosine distance — turning discovery's
 * O(N) full scan into an ANN lookup. The existing blend + guardrail scoring
 * then runs unchanged on that small pruned set, so behavior is identical while
 * agents ≤ pool size and only prunes once the roster outgrows it.
 *
 * Everything degrades gracefully: if the extension/column/index is missing or a
 * query fails, `available` stays false and discovery falls back to the full scan.
 */
const EMBED_DIM = 1536;
let available = false;

export function isPgVectorAvailable(): boolean {
  return available;
}

/** Serialize a numeric vector to a pgvector text literal: `[a,b,c]`. */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Idempotently ensures the extension and HNSW index exist. Safe to call on every
 * boot. Flips `available` on success so callers know the ANN path is usable.
 */
export async function ensurePgVectorSchema(): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS agent_interest_hnsw ON "Agent" USING hnsw ("interestEmbedding" vector_cosine_ops)`
    );
    available = true;
    return true;
  } catch (err) {
    console.warn("⚠️ pgvector unavailable; discovery will use the O(N) fallback:", (err as Error).message);
    available = false;
    return false;
  }
}

/** Persist one agent's interest embedding (1536-dim) into the vector column. */
export async function setAgentEmbedding(agentId: string, vec: number[]): Promise<void> {
  const lit = toVectorLiteral(vec);
  // $1 is bound as text and cast to vector — the literal is numbers/brackets only.
  await prisma.$executeRawUnsafe(
    `UPDATE "Agent" SET "interestEmbedding" = $1::vector WHERE id = $2`,
    lit,
    agentId
  );
}

/**
 * Backfill embeddings for any agent missing one. Uses the deterministic local
 * embedding so it needs no API key and always matches the query-side space.
 */
export async function ensureAgentEmbeddings(): Promise<number> {
  if (!available) return 0;
  const rows = await prisma.$queryRawUnsafe<{ id: string; interests: string }[]>(
    `SELECT id, interests FROM "Agent" WHERE "interestEmbedding" IS NULL`
  );
  let count = 0;
  for (const row of rows) {
    let interests: string[] = [];
    try {
      interests = JSON.parse(row.interests);
    } catch {
      interests = [];
    }
    const vec = getIndexEmbedding(interests.join(" "), EMBED_DIM);
    await setAgentEmbedding(row.id, vec);
    count++;
  }
  return count;
}

/**
 * ANN prune: nearest agent ids to the post embedding, by cosine distance,
 * excluding the author. Returns null on any failure so the caller falls back.
 */
export async function annCandidateAgentIds(
  postContent: string,
  authorId: string,
  limit: number
): Promise<string[] | null> {
  if (!available) return null;
  try {
    const lit = toVectorLiteral(getIndexEmbedding(postContent, EMBED_DIM));
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Agent"
       WHERE "interestEmbedding" IS NOT NULL AND id <> $2
       ORDER BY "interestEmbedding" <=> $1::vector
       LIMIT $3`,
      lit,
      authorId,
      limit
    );
    return rows.map((r) => r.id);
  } catch (err) {
    console.warn("pgvector ANN query failed; falling back to full scan:", (err as Error).message);
    return null;
  }
}
