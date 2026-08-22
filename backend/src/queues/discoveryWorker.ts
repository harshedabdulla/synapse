import { Worker, Job } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis";
import { DiscoveryService } from "../services/discovery";
import { agentActionQueue } from "./postQueue";

export interface DiscoveryJobData {
  postId: string;
  content: string;
  authorId: string;
  depth: number;
  parentId?: string;
  threadContext?: string;
}

export function startDiscoveryWorker() {
  const connection = getRedisConnectionOptions();

  const worker = new Worker<DiscoveryJobData>(
    "candidate-discovery-queue",
    async (job: Job<DiscoveryJobData>) => {
      const { postId, content, authorId, depth, parentId, threadContext } = job.data;
      console.log(`🔍 [DiscoveryWorker] Processing discovery for Post/Comment ${postId} at depth ${depth}`);

      const approvedCandidates = await DiscoveryService.discoverCandidatesForContent(
        postId,
        content,
        authorId,
        depth
      );

      console.log(
        `🎯 [DiscoveryWorker] Discovered ${approvedCandidates.length} approved candidates: ${approvedCandidates
          .map((a) => a.handle)
          .join(", ")}`
      );

      // Enqueue action jobs for each approved agent with slight staggered delays (150ms) to simulate organic pacing
      let delay = 200;
      for (const agent of approvedCandidates) {
        await agentActionQueue.add(
          "agent-action",
          {
            agentId: agent.id,
            postId,
            targetContent: content,
            depth,
            parentId,
            threadContext: threadContext || content,
          },
          // jobId deduplicates concurrent duplicate actions for the same agent+node+depth.
          { delay, jobId: `action-${postId}-${agent.id}-${depth}` }
        );
        delay += 600;
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    console.log(`✅ [DiscoveryWorker] Job ${job.id} completed.`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ [DiscoveryWorker] Job ${job?.id} failed:`, err);
  });

  return worker;
}
