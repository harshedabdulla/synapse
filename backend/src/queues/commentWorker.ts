import { Worker, Job } from "bullmq";
import { getRedisConnectionOptions, redis } from "../config/redis";
import { prisma } from "../config/db";
import { AgentRunnerService } from "../services/agentRunner";
import { GuardrailsService } from "../services/guardrails";
import { candidateDiscoveryQueue } from "./postQueue";
import { sseManager } from "../services/sse";
import { ReactionType } from "@prisma/client";

export interface AgentActionJobData {
  agentId: string;
  postId: string;
  targetContent: string;
  depth: number;
  parentId?: string;
  threadContext?: string;
}

export function startCommentWorker() {
  const connection = getRedisConnectionOptions();

  const worker = new Worker<AgentActionJobData>(
    "agent-action-queue",
    async (job: Job<AgentActionJobData>) => {
      const { agentId, postId, targetContent, depth, parentId, threadContext } = job.data;

      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
      });

      if (!agent) {
        console.warn(`[CommentWorker] Agent ${agentId} not found.`);
        return;
      }

      console.log(`🧠 [CommentWorker] Evaluating action for ${agent.handle} at depth ${depth}`);

      // Atomically RESERVE budget + thread slot BEFORE spending an LLM call.
      // This closes the check-then-increment TOCTOU race under concurrency > 1.
      const gotRate = await GuardrailsService.reserveRate(agent.id, "comment");
      if (!gotRate) {
        console.warn(`[CommentWorker] ${agent.handle} over hourly comment budget, skipping.`);
        return;
      }
      const gotThread = await GuardrailsService.reserveThread(postId, agent.id);
      if (!gotThread) {
        // Refund the rate slot we just took — this agent won't act on this thread.
        await GuardrailsService.refundRate(agent.id, "comment");
        console.warn(`[CommentWorker] ${agent.handle} over per-thread quota, skipping.`);
        return;
      }

      // Execute Agent LLM / Persona Reasoning
      const decision = await AgentRunnerService.executeAgentReasoning(
        agent,
        targetContent,
        postId,
        threadContext,
        depth
      );

      // Handle COMMENT action
      if (decision.shouldInteract && decision.action === "COMMENT" && decision.content) {
        // Budget + thread slot already reserved atomically above.
        // Idempotent write: retries of the same job resolve to the same row via unique jobKey.
        const jobKey = `cmt:${postId}:${agent.id}:${parentId ?? "root"}:${depth}`;
        const newComment = await prisma.comment.upsert({
          where: { jobKey },
          update: {},
          create: {
            jobKey,
            postId,
            authorId: agent.id,
            parentId: parentId || null,
            content: decision.content,
            threadDepth: depth + 1,
          },
          include: {
            author: true,
          },
        });

        console.log(`💬 [CommentWorker] ${agent.handle} posted comment at depth ${depth + 1}: "${decision.content}"`);

        // If a reaction was also chosen, persist it
        if (decision.reactionType) {
          try {
            await prisma.reaction.upsert({
              where: {
                postId_agentId_type: {
                  postId,
                  agentId: agent.id,
                  type: decision.reactionType as ReactionType,
                },
              },
              update: {},
              create: {
                postId,
                agentId: agent.id,
                type: decision.reactionType as ReactionType,
              },
            });
          } catch (e) {
            // non-fatal reaction upsert conflict
          }
        }

        // Invalidate Redis feed cache
        try {
          await redis.del("feed:global");
        } catch (e) {
          // ignore
        }

        // Broadcast Feed Update
        sseManager.broadcast("FEED_UPDATED", {
          eventType: "COMMENT_CREATED",
          postId,
          commentId: newComment.id,
          authorHandle: agent.handle,
          depth: depth + 1,
        });

        // Cascading Fanout: If depth + 1 < 4, trigger discovery for next replies
        if (depth + 1 < 4) {
          console.log(`🔄 [CommentWorker] Triggering cascading discovery for comment at depth ${depth + 1}`);
          const updatedContext = `${threadContext}\n${agent.handle}: ${decision.content}`;
          await candidateDiscoveryQueue.add(
            "discover-cascade",
            {
              postId,
              content: decision.content,
              authorId: agent.id,
              depth: depth + 1,
              parentId: newComment.id,
              threadContext: updatedContext,
            },
            { delay: 1000, jobId: `discovery-${postId}-${newComment.id}-${depth + 1}` }
          );
        } else {
          console.log(`🛑 [CommentWorker] Thread branch depth limit reached (${depth + 1} >= 4). Stopping cascade.`);
        }
      } else if (decision.shouldInteract && decision.action === "REACTION" && decision.reactionType) {
        // Reaction only — no comment written, so refund the comment budget + thread slot we reserved.
        await GuardrailsService.refundRate(agent.id, "comment");
        await GuardrailsService.refundThread(postId, agent.id);

        // Handle REACTION only
        try {
          await prisma.reaction.upsert({
            where: {
              postId_agentId_type: {
                postId,
                agentId: agent.id,
                type: decision.reactionType as ReactionType,
              },
            },
            update: {},
            create: {
              postId,
              agentId: agent.id,
              type: decision.reactionType as ReactionType,
            },
          });

          sseManager.broadcast("FEED_UPDATED", {
            eventType: "REACTION_CREATED",
            postId,
            authorHandle: agent.handle,
            reactionType: decision.reactionType,
          });
        } catch (e) {
          // ignore
        }
      } else {
        // IGNORE (or malformed decision) — agent chose not to act. Refund reserved budget.
        await GuardrailsService.refundRate(agent.id, "comment");
        await GuardrailsService.refundThread(postId, agent.id);
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    console.log(`✅ [CommentWorker] Action job ${job.id} completed.`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ [CommentWorker] Action job ${job?.id} failed:`, err);
  });

  return worker;
}
