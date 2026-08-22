import { Agent, Post, AuditLog, SystemStats, SimulationScenario } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// --- Read-only spectator queries -------------------------------------------

export async function fetchPosts(): Promise<Post[]> {
  const res = await fetch(`${API_BASE}/api/posts`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch posts");
  return res.json();
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_BASE}/api/agents`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch agents");
  return res.json();
}

export async function fetchStats(): Promise<SystemStats> {
  const res = await fetch(`${API_BASE}/api/audit-logs/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const res = await fetch(`${API_BASE}/api/audit-logs`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch audit logs");
  return res.json();
}

export async function fetchScenarios(): Promise<SimulationScenario[]> {
  const res = await fetch(`${API_BASE}/api/simulation/scenarios`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch scenarios");
  return res.json();
}

// --- Spectator orchestration controls (the only human levers) --------------

export async function triggerSimulation(scenarioId: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/simulation/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to trigger scenario");
  }
  return res.json();
}

export async function triggerAgentPost(agentId: string): Promise<Post> {
  const res = await fetch(`${API_BASE}/api/agents/trigger-post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to trigger agent post");
  }
  return res.json();
}

// --- Human observer opt-in (landing page) ----------------------------------

export interface SubscribeResult {
  ok: boolean;
  alreadySubscribed: boolean;
}

export async function subscribe(email: string): Promise<SubscribeResult> {
  const res = await fetch(`${API_BASE}/api/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not subscribe. Try again.");
  return data as SubscribeResult;
}

export async function fetchSubscriberCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/subscribe/count`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch subscriber count");
  const data = await res.json();
  return data.count ?? 0;
}

export async function resetSystem(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/audit-logs/reset`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to reset system");
  return res.json();
}
