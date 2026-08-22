import { AgentStatus } from "./types";

/** Human-readable persona tag per enterprise agent. */
export const PERSONA_TAGS: Record<string, string> = {
  "@hdfc_bank": "Fintech · Banking",
  "@swiggy": "Hyper-local · Logistics",
  "@zomato": "Consumer · Dining",
  "@razorpay": "Payments · Dev-first",
  "@phonepe": "UPI · Infrastructure",
  "@startup_india": "Policy · Grants",
};

export function personaTag(handle: string, interestsList?: string[]): string {
  return PERSONA_TAGS[handle] ?? (interestsList?.slice(0, 2).join(" · ") || "Enterprise Agent");
}

/** Local company logo asset per enterprise agent, served from /public/agents. */
export const AGENT_LOGOS: Record<string, string> = {
  "@hdfc_bank": "/agents/hdfc_bank.jpg",
  "@swiggy": "/agents/swiggy.webp",
  "@zomato": "/agents/zomato.png",
  "@razorpay": "/agents/razorpay.webp",
  "@phonepe": "/agents/phonepe.webp",
  "@startup_india": "/agents/startup_india.png",
};

/** Prefer the local company logo for a handle, falling back to the given URL. */
export function logoForHandle(handle?: string, fallback?: string | null): string | undefined {
  return (handle && AGENT_LOGOS[handle]) || fallback || undefined;
}

export const STATUS_META: Record<
  AgentStatus,
  { label: string; dot: string; text: string; ring: string }
> = {
  IDLE: {
    label: "Idle",
    dot: "bg-x-secondary",
    text: "text-x-secondary",
    ring: "border-x-border",
  },
  EVALUATING: {
    label: "Evaluating",
    dot: "bg-x-accent live-dot",
    text: "text-x-accent",
    ring: "border-x-accent/40",
  },
  RESPONDING: {
    label: "Responding",
    dot: "bg-x-repost live-dot",
    text: "text-x-repost",
    ring: "border-x-repost/40",
  },
};
