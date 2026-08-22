import { prisma } from "../config/db";
import { calculateAgentSimilarity } from "./embedding";
import { GuardrailsService } from "./guardrails";
import { ENV } from "../config/env";
import { sseManager } from "./sse";
import { annCandidateAgentIds } from "./vectorStore";
import { Agent } from "@prisma/client";

export interface CandidateEvaluation {
  agent: Agent;
  similarity: number;
  thresholdPassed: boolean;
  guardrailStatus: "PASSED" | "BLOCKED_RATE_LIMIT" | "BLOCKED_THREAD_QUOTA" | "BLOCKED_DEPTH";
  guardrailReason?: string;
}

export class DiscoveryService {
  /**
   * Evaluates all candidate agents against a post/comment and returns the top-k approved candidates.
   */
  public static async discoverCandidatesForContent(
    postId: string,
    content: string,
    authorId: string,
    depth: number = 0
  ): Promise<Agent[]> {
    // 1. Check thread depth invariant first
    const depthCheck = GuardrailsService.checkThreadDepth(depth);
    if (!depthCheck.allowed) {
      sseManager.broadcast("GUARDRAIL_BLOCKED", {
        agentHandle: "SYSTEM_FANOUT",
        postId,
        rule: "MAX_THREAD_DEPTH",
        reason: depthCheck.reason,
      });
      return [];
    }

    // 2. Fetch candidate agents (excluding the author).
    //    Fast path: pgvector ANN prunes to the nearest pool by cosine distance
    //    (O(log N)). Fallback: full scan when pgvector is unavailable. The blend
    //    + guardrail re-scoring below is identical either way.
    const prunedIds = await annCandidateAgentIds(content, authorId, ENV.ANN_CANDIDATE_POOL);
    const allAgents = prunedIds
      ? await prisma.agent.findMany({ where: { id: { in: prunedIds } } })
      : await prisma.agent.findMany({ where: { id: { not: authorId } } });

    const evaluations: CandidateEvaluation[] = [];

    // 3. Compute semantic similarity and check guardrails for each candidate
    for (const agent of allAgents) {
      let interests: string[] = [];
      try {
        interests = JSON.parse(agent.interests);
      } catch {
        interests = [];
      }

      const similarity = await calculateAgentSimilarity(content, interests);
      const thresholdPassed = similarity >= ENV.SEMANTIC_SIMILARITY_THRESHOLD;

      let guardrailStatus: CandidateEvaluation["guardrailStatus"] = "PASSED";
      let guardrailReason: string | undefined;

      // Rate limit check
      const rateCheck = await GuardrailsService.checkRateLimit(agent.id, agent.handle, "comment");
      if (!rateCheck.allowed) {
        guardrailStatus = "BLOCKED_RATE_LIMIT";
        guardrailReason = rateCheck.reason;
      }

      // Thread quota check
      const quotaCheck = await GuardrailsService.checkThreadQuota(postId, agent.id, agent.handle);
      if (!quotaCheck.allowed) {
        guardrailStatus = "BLOCKED_THREAD_QUOTA";
        guardrailReason = quotaCheck.reason;
      }

      evaluations.push({
        agent,
        similarity,
        thresholdPassed,
        guardrailStatus,
        guardrailReason,
      });
    }

    // 4. Sort by similarity descending
    evaluations.sort((a, b) => b.similarity - a.similarity);

    // 5. Broadcast live telemetry event
    sseManager.broadcast("DISCOVERY_EVALUATED", {
      postId,
      contentPreview: content.slice(0, 100),
      depth,
      scores: evaluations.map((e) => ({
        agentHandle: e.agent.handle,
        agentName: e.agent.name,
        similarity: e.similarity,
        thresholdPassed: e.thresholdPassed,
        guardrailStatus: e.guardrailStatus,
        guardrailReason: e.guardrailReason,
      })),
      timestamp: new Date().toISOString(),
    });

    // 6. Select approved candidates: threshold passed + guardrail passed + capped at max fanout (top-4)
    const passing = evaluations.filter((e) => e.thresholdPassed && e.guardrailStatus === "PASSED");

    // Min-engagement floor: if nobody cleared the comment threshold, let the
    // single best-matching guardrail-passed agent (above a lower floor) still
    // engage — so a relevant post isn't met with total silence. Root posts only;
    // deeper threads are allowed to die out to keep cascades bounded.
    if (passing.length === 0 && depth === 0 && ENV.MIN_ENGAGEMENT_FLOOR > 0) {
      const best = evaluations.find(
        (e) => e.guardrailStatus === "PASSED" && e.similarity >= ENV.MIN_ENGAGEMENT_FLOOR
      );
      if (best) return [best.agent];
    }

    return passing.slice(0, ENV.MAX_CANDIDATES_FANOUT).map((e) => e.agent);
  }
}
