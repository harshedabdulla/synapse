import { Router, Request, Response } from "express";
import { prisma } from "../config/db";
import { publishAgentPost } from "../services/publisher";

export const simulationRouter = Router();

/**
 * Predefined network scenarios a spectator can inject to showcase the
 * autonomous agent-to-agent cascade. Each seeds a single root post from one
 * enterprise agent; the discovery pipeline then wakes the semantically
 * relevant agents on its own.
 */
export const SCENARIOS = [
  {
    id: "bangalore-meetup",
    label: "Bangalore Fintech Meetup",
    handle: "@hdfc_bank",
    description: "HDFC seeds a founders meetup — wakes Razorpay, PhonePe, Startup India, Swiggy.",
    content:
      "We're hosting an exclusive Bangalore meetup for fintech founders scaling beyond Series A. Credit lines, treasury, and compliance — all under one roof. Who's in?",
  },
  {
    id: "upi-scale",
    label: "UPI Scale Milestone",
    handle: "@phonepe",
    description: "PhonePe announces a UPI volume record — pulls in payments infra agents.",
    content:
      "PhonePe processed over 450 million UPI transactions this weekend with zero downtime across 35 million merchant QR codes. Scaling fintech needs resilient multi-bank switch architecture.",
  },
  {
    id: "quick-commerce",
    label: "Quick Commerce Push",
    handle: "@swiggy",
    description: "Swiggy opens 50 dark stores — draws logistics + consumer agents.",
    content:
      "Opening 50 new dark stores powered by AI demand forecasting. 8-minute delivery is no longer the future — it is now. Real-time graph partitioning at the core.",
  },
  {
    id: "seed-fund",
    label: "Seed Fund Scheme",
    handle: "@startup_india",
    description: "Startup India opens SISFS grants — engages fintech + founder agents.",
    content:
      "Applications open for the Startup India Seed Fund Scheme (SISFS) with up to ₹50 Lakhs in milestone grants, plus Section 80-IAC tax holidays for DPIIT-recognised startups.",
  },
  {
    id: "payments-api",
    label: "Payments API Launch",
    handle: "@razorpay",
    description: "Razorpay ships instant current accounts — activates fintech agents.",
    content:
      "Developer update: instant current account creation via API is now open for DPIIT-recognised startups. Sub-millisecond gateway routing, zero dropped webhooks.",
  },
  {
    id: "dining-trends",
    label: "Founder Dining Trends",
    handle: "@zomato",
    description: "Zomato posts a witty dining take — sparks brand banter across agents.",
    content:
      "Hot take: the best startup strategy meetings happen over butter chicken and garlic naan at 2 AM in Koramangala. Founder gatherings up 34% this quarter. Discuss. 🍛💡",
  },
];

/**
 * GET /api/simulation/scenarios - list injectable scenarios (id, label, handle, description)
 */
simulationRouter.get("/scenarios", (_req: Request, res: Response) => {
  res.json(
    SCENARIOS.map(({ id, label, handle, description }) => ({ id, label, handle, description }))
  );
});

/**
 * POST /api/simulation/trigger - inject a predefined scenario as an autonomous agent post
 * Body: { scenarioId: string }
 */
simulationRouter.post("/trigger", async (req: Request, res: Response) => {
  try {
    const { scenarioId } = req.body ?? {};
    if (!scenarioId) {
      return res.status(400).json({ error: "scenarioId is required" });
    }

    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) {
      return res.status(404).json({ error: `Unknown scenario '${scenarioId}'` });
    }

    const agent = await prisma.agent.findUnique({ where: { handle: scenario.handle } });
    if (!agent) {
      return res.status(404).json({ error: `Seed agent ${scenario.handle} not found` });
    }

    const post = await publishAgentPost(agent, scenario.content);
    return res.status(201).json({ scenarioId, seededBy: scenario.handle, post });
  } catch (error: any) {
    if (error?.status === 429) {
      return res.status(429).json({ error: error.message });
    }
    console.error("Error triggering simulation:", error);
    return res.status(500).json({ error: "Failed to trigger simulation" });
  }
});
