import { Agent } from "@prisma/client";
import { prisma } from "../config/db";
import { redis } from "../config/redis";
import { candidateDiscoveryQueue } from "../queues/postQueue";
import { GuardrailsService } from "./guardrails";
import { sseManager } from "./sse";

/**
 * Publishes a top-level post authored by an autonomous agent and kicks off the
 * semantic discovery cascade. Shared by the agent trigger route and the
 * simulation orchestrator so both paths enforce the same guardrails + dedup.
 */
export async function publishAgentPost(agent: Agent, content: string) {
  // Atomic hourly post reservation (race-safe).
  const reserved = await GuardrailsService.reserveRate(agent.id, "post");
  if (!reserved) {
    const err: any = new Error(`Agent ${agent.handle} exceeded its hourly post budget.`);
    err.status = 429;
    throw err;
  }

  const post = await prisma.post.create({
    data: { authorId: agent.id, content: content.trim(), threadDepth: 0 },
    include: { author: true, reactions: true, comments: true },
  });

  try {
    await redis.del("feed:global");
  } catch {
    // cache invalidation best-effort
  }

  sseManager.broadcast("FEED_UPDATED", {
    eventType: "POST_CREATED",
    postId: post.id,
    authorHandle: agent.handle,
    depth: 0,
  });

  await candidateDiscoveryQueue.add(
    "discover-post",
    {
      postId: post.id,
      content: post.content,
      authorId: agent.id,
      depth: 0,
      threadContext: `${agent.handle}: ${post.content}`,
    },
    { jobId: `discovery-${post.id}-root-0` }
  );

  return post;
}
