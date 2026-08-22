import { Router, Request, Response } from "express";
import { prisma } from "../config/db";
import { redis } from "../config/redis";
import { candidateDiscoveryQueue } from "../queues/postQueue";
import { GuardrailsService } from "../services/guardrails";
import { sseManager } from "../services/sse";
import { authenticateAgent, stripAgentSecrets } from "../middleware/auth";

export const postsRouter = Router();

// Max characters accepted for any human/operator-authored content node.
const MAX_CONTENT_LENGTH = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Rebuilds the global feed from Postgres and repopulates the Redis cache.
 */
async function buildAndCacheFeed(): Promise<any[]> {
  // Count a cache miss (DB rebuild) for the observability panel's hit-ratio.
  try {
    await redis.incr("metrics:cache:miss");
  } catch {
    // best-effort metric
  }
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      author: true,
      reactions: { include: { agent: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: true },
      },
    },
  });

  const structuredPosts = stripAgentSecrets(
    posts.map((post) => ({
      ...post,
      commentsCount: post.comments.length,
      reactionsCount: post.reactions.length,
      commentTree: buildCommentTree(post.comments),
    }))
  );

  try {
    await redis.set("feed:global", JSON.stringify(structuredPosts), "EX", 10);
  } catch (e) {
    // ignore cache write failure
  }
  return structuredPosts;
}

// Helper to structure flat comments into a nested hierarchy tree
function buildCommentTree(comments: any[], parentId: string | null = null): any[] {
  return comments
    .filter((c) => c.parentId === parentId)
    .map((c) => ({
      ...c,
      children: buildCommentTree(comments, c.id),
    }));
}

/**
 * GET /api/posts - Get global feed with nested comments and reactions
 */
postsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    // 1. Fast path: serve cached feed if warm.
    try {
      const cached = await redis.get("feed:global");
      if (cached) {
        redis.incr("metrics:cache:hit").catch(() => {});
        return res.json(JSON.parse(cached));
      }
    } catch (e) {
      // Redis down — skip straight to DB.
      return res.json(await buildAndCacheFeed());
    }

    // 2. Cache miss: single-flight guard so only ONE request rebuilds from DB
    //    (prevents a cache-stampede when the key expires under concurrent load).
    let gotLock = false;
    try {
      const lock = await redis.set("feed:global:lock", "1", "EX", 5, "NX");
      gotLock = lock === "OK";
    } catch (e) {
      // treat lock failure as "no lock" and fall through
    }

    if (!gotLock) {
      // A peer is rebuilding — briefly wait for it to publish, then serve its result.
      for (let i = 0; i < 5; i++) {
        await sleep(40);
        try {
          const cached = await redis.get("feed:global");
          if (cached) return res.json(JSON.parse(cached));
        } catch {
          break;
        }
      }
      // Lost the race and cache still cold — fall back to a direct read (no stampede: rare path).
      return res.json(await buildAndCacheFeed());
    }

    // 3. We hold the lock: rebuild, cache, release.
    try {
      const feed = await buildAndCacheFeed();
      return res.json(feed);
    } finally {
      try {
        await redis.del("feed:global:lock");
      } catch {
        // lock will auto-expire via TTL
      }
    }
  } catch (error) {
    console.error("Error fetching posts:", error);
    return res.status(500).json({ error: "Failed to fetch posts" });
  }
});

/**
 * POST /api/posts - Create a new post and initiate semantic fanout
 */
postsRouter.post("/", authenticateAgent, async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    // authorId is derived from the authenticated key, never trusted from the body.
    const agent = req.agent!;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "content is required" });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return res.status(413).json({ error: `content exceeds ${MAX_CONTENT_LENGTH} character limit` });
    }

    // Same-agent post debounce: collapse rapid duplicate submits at the edge
    // before they consume a rate slot or spawn a discovery cascade.
    const notDebounced = await GuardrailsService.debouncePost(agent.id);
    if (!notDebounced) {
      return res.status(429).json({
        error: `Agent ${agent.handle} is posting too fast; try again in a moment.`,
      });
    }

    // Atomically reserve the hourly post slot (race-safe; no separate check+increment).
    const reserved = await GuardrailsService.reserveRate(agent.id, "post");
    if (!reserved) {
      return res.status(429).json({ error: `Agent ${agent.handle} exceeded hourly post budget.` });
    }

    // Insert Post into database
    const post = await prisma.post.create({
      data: {
        authorId: agent.id,
        content: content.trim(),
        threadDepth: 0,
      },
      include: {
        author: true,
        reactions: true,
        comments: true,
      },
    });

    // Invalidate Redis feed cache
    try {
      await redis.del("feed:global");
    } catch (e) {
      // ignore
    }

    // Broadcast SSE Event
    sseManager.broadcast("FEED_UPDATED", {
      eventType: "POST_CREATED",
      postId: post.id,
      authorHandle: agent.handle,
      depth: 0,
    });

    // Enqueue candidate discovery job to BullMQ (jobId dedups accidental double-submits)
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

    console.log(`🚀 [PostRouter] Post created by ${agent.handle}: "${post.content.slice(0, 60)}..."`);

    return res.status(201).json(stripAgentSecrets(post));
  } catch (error) {
    console.error("Error creating post:", error);
    return res.status(500).json({ error: "Failed to create post" });
  }
});

/**
 * POST /api/posts/:id/comments - Operator replies to a post as an agent
 */
postsRouter.post("/:id/comments", authenticateAgent, async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    const agent = req.agent!; // authenticated identity

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "content is required" });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return res.status(413).json({ error: `content exceeds ${MAX_CONTENT_LENGTH} character limit` });
    }

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Atomically reserve the hourly comment slot (race-safe).
    const gotRate = await GuardrailsService.reserveRate(agent.id, "comment");
    if (!gotRate) {
      return res.status(429).json({ error: `Agent ${agent.handle} exceeded hourly comment budget.` });
    }
    // Atomically reserve the per-thread interaction slot; refund the rate slot if the thread is full.
    const gotThread = await GuardrailsService.reserveThread(post.id, agent.id);
    if (!gotThread) {
      await GuardrailsService.refundRate(agent.id, "comment");
      return res.status(429).json({ error: `Agent ${agent.handle} reached per-thread interaction quota.` });
    }

    const comment = await prisma.comment.create({
      data: {
        postId: post.id,
        authorId: agent.id,
        content: content.trim(),
        threadDepth: post.threadDepth + 1,
      },
      include: {
        author: true,
      },
    });

    // Invalidate Redis feed cache
    try {
      await redis.del("feed:global");
    } catch (e) {
      // ignore
    }

    // Broadcast SSE Event
    sseManager.broadcast("FEED_UPDATED", {
      eventType: "COMMENT_CREATED",
      postId: post.id,
      commentId: comment.id,
      authorHandle: agent.handle,
      depth: comment.threadDepth,
    });

    // Enqueue candidate discovery so autonomous agents can evaluate & react to this reply
    await candidateDiscoveryQueue.add(
      "discover-comment",
      {
        postId: post.id,
        content: comment.content,
        authorId: agent.id,
        depth: comment.threadDepth,
        threadContext: `${agent.handle}: ${comment.content}`,
      },
      { jobId: `discovery-${post.id}-${comment.id}-${comment.threadDepth}` }
    );

    return res.status(201).json(stripAgentSecrets(comment));
  } catch (error) {
    console.error("Error creating comment:", error);
    return res.status(500).json({ error: "Failed to create comment" });
  }
});

/**
 * POST /api/posts/:id/reactions - Operator toggles a like (LIKE) or repost (AGREE)
 */
postsRouter.post("/:id/reactions", authenticateAgent, async (req: Request, res: Response) => {
  try {
    const { type } = req.body;
    const agent = req.agent!; // authenticated identity

    if (!type) {
      return res.status(400).json({ error: "type is required" });
    }
    if (type !== "LIKE" && type !== "AGREE") {
      return res.status(400).json({ error: "type must be LIKE or AGREE" });
    }

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const existing = await prisma.reaction.findUnique({
      where: {
        postId_agentId_type: {
          postId: post.id,
          agentId: agent.id,
          type,
        },
      },
    });

    let action: "added" | "removed";
    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      action = "removed";
    } else {
      await prisma.reaction.create({
        data: {
          postId: post.id,
          agentId: agent.id,
          type,
        },
      });
      action = "added";
    }

    // Invalidate Redis feed cache
    try {
      await redis.del("feed:global");
    } catch (e) {
      // ignore
    }

    // Broadcast SSE Event
    sseManager.broadcast("FEED_UPDATED", {
      eventType: action === "added" ? "REACTION_ADDED" : "REACTION_REMOVED",
      postId: post.id,
      authorHandle: agent.handle,
      depth: post.threadDepth,
    });

    return res.json({ action, postId: post.id, type });
  } catch (error) {
    console.error("Error toggling reaction:", error);
    return res.status(500).json({ error: "Failed to toggle reaction" });
  }
});

/**
 * GET /api/posts/:id - Get a single post by ID
 */
postsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        author: true,
        reactions: {
          include: { agent: true },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: true },
        },
      },
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    return res.json(
      stripAgentSecrets({
        ...post,
        commentTree: buildCommentTree(post.comments),
      })
    );
  } catch (error) {
    console.error("Error fetching single post:", error);
    return res.status(500).json({ error: "Failed to fetch post" });
  }
});
