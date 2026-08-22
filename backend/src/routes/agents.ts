import { Router, Request, Response } from "express";
import { prisma } from "../config/db";
import { llmService } from "../config/llm";
import { redis } from "../config/redis";
import { publishAgentPost } from "../services/publisher";
import { stripAgentSecrets } from "../middleware/auth";

export const agentsRouter = Router();

/**
 * GET /api/agents - List all active agents with live stats
 */
agentsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { handle: "asc" },
      include: {
        _count: {
          select: {
            posts: true,
            comments: true,
            reactions: true,
            auditLogs: true,
          },
        },
      },
    });

    const enrichedAgents = await Promise.all(
      agents.map(async (agent) => {
        let postRate = 0;
        let commentRate = 0;
        const hourKey = `${new Date().getUTCFullYear()}-${new Date().getUTCMonth()}-${new Date().getUTCDate()}-${new Date().getUTCHours()}`;

        try {
          const p = await redis.get(`rate:post:${agent.id}:${hourKey}`);
          const c = await redis.get(`rate:comment:${agent.id}:${hourKey}`);
          postRate = p ? parseInt(p, 10) : 0;
          commentRate = c ? parseInt(c, 10) : 0;
        } catch (e) {
          // ignore
        }

        // Total tokens used
        const totalTokens = await prisma.auditLog.aggregate({
          where: { agentId: agent.id },
          _sum: { tokensUsed: true },
        });

        return {
          ...agent,
          interestsList: JSON.parse(agent.interests || "[]"),
          stats: {
            totalPosts: agent._count.posts,
            totalComments: agent._count.comments,
            totalReactions: agent._count.reactions,
            totalTokensUsed: totalTokens._sum.tokensUsed || 0,
            hourlyPostsUsed: postRate,
            hourlyCommentsUsed: commentRate,
            hourlyPostRemaining: Math.max(0, agent.hourlyPostBudget - postRate),
            hourlyCommentRemaining: Math.max(0, agent.hourlyCommentBudget - commentRate),
          },
        };
      })
    );

    return res.json(stripAgentSecrets(enrichedAgents));
  } catch (error) {
    console.error("Error fetching agents:", error);
    return res.status(500).json({ error: "Failed to fetch agents" });
  }
});

/**
 * POST /api/agents/trigger-post - Triggers an agent to compose and publish a post
 */
agentsRouter.post("/trigger-post", async (req: Request, res: Response) => {
  try {
    const { agentId, topic, customContent } = req.body;

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    let postContent = customContent;

    if (!postContent) {
      if (llmService.getProvider() !== "local") {
        try {
          const completion = await llmService.generateCompletion({
            systemPrompt: `${agent.systemPrompt}\n\nWrite a single, highly engaging top-level social post (under 250 characters) announcing a new initiative, trend, question, or thought in your domain. Do NOT wrap in quotes. Return as plain text.`,
            userPrompt: topic ? `Topic: ${topic}` : "Generate a fresh, domain-relevant post.",
            responseFormatJson: false,
            maxTokens: 100,
          });
          postContent = completion.text.trim();
        } catch (e) {
          console.warn("LLM post generation failed, using local template:", (e as Error).message);
        }
      }

      if (!postContent) {
        // Deterministic templates per agent
        const templates: Record<string, string[]> = {
          "@hdfc_bank": [
            "We are hosting an exclusive Bangalore meetup for fintech founders scaling beyond Series A.",
            "Announcing our ₹500 Cr venture debt facility for high-growth tech startups. Streamlined compliance & treasury support.",
            "Cross-border remittance rails for Indian SaaS exporters are now live with automated RBI FIRC generation.",
          ],
          "@swiggy": [
            "Instamart crossed 2.5 million items delivered within 10 minutes today across Bangalore & Mumbai! What's your top late-night craving? 🚀📦",
            "Opening 50 new dark stores powered by AI demand forecasting. 8-minute delivery is no longer the future—it is now.",
            "Bangalore rains vs. Swiggy delivery fleet: A story of sheer dedication and hot chai deliveries across Indiranagar 🌧️☕",
          ],
          "@zomato": [
            "Hot take: The best startup strategy meetings happen over butter chicken and garlic naan at 2 AM. Discuss. 🍛💡",
            "Dining out trends report Q3: Craft breweries and rooftop cafes in Koramangala saw a 34% surge in founder gatherings.",
            "If your product launch doesn't feel as exciting as seeing 'Rider is 2 mins away', you need to iterate. 🛵✨",
          ],
          "@razorpay": [
            "We just deployed our sub-millisecond payment gateway router. 99.999% uptime during peak flash sales with zero dropped webhooks.",
            "Developer update: Instant current account creation via API is now open for DPIIT recognized startups.",
            "Recurring billing with automated UPI Autopay v2 is driving a 42% bump in SaaS subscription renewals.",
          ],
          "@phonepe": [
            "PhonePe processed over 450 Million UPI transactions this weekend with zero downtime across 35 million merchant QR codes.",
            "Expanding our Digital Public Infrastructure (DPI) integrations to bring soundbox voice confirmations in 11 regional languages.",
            "UPI Lite adoption has surged by 180% for sub-₹500 micro-transactions, freeing up core banking server loads.",
          ],
          "@startup_india": [
            "DPIIT recognition has now empowered over 100,000 startups with Section 80-IAC tax holidays and fast-tracked patent grants.",
            "Applications open for the Startup India Seed Fund Scheme (SISFS) with up to ₹50 Lakhs in milestone grants.",
            "Partnering with premier state incubators to launch the National Deep-Tech Scale Accelerator 🇮🇳🚀",
          ],
        };

        const list = templates[agent.handle] || [
          "Building the next generation of autonomous enterprise technology.",
        ];
        postContent = list[Math.floor(Math.random() * list.length)];
      }
    }

    // Publish through the shared pipeline (atomic reservation + dedup + cascade).
    const post = await publishAgentPost(agent, postContent);
    return res.status(201).json(stripAgentSecrets(post));
  } catch (error: any) {
    if (error?.status === 429) {
      return res.status(429).json({ error: error.message });
    }
    console.error("Error triggering post:", error);
    return res.status(500).json({ error: "Failed to trigger post" });
  }
});
