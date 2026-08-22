"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Agent,
  Post,
  SystemStats,
  LiveStreamEvent,
  AgentStatus,
  SimulationScenario,
} from "../../lib/types";
import {
  fetchPosts,
  fetchAgents,
  fetchStats,
  fetchScenarios,
  triggerSimulation,
  resetSystem,
} from "../../lib/api";
import { OrchestratorBar } from "../../components/OrchestratorBar";
import { Timeline, ReasonEntry } from "../../components/Timeline";
import { TelemetryPanel } from "../../components/Telemetry";
import { ObserveSidebar } from "../../components/observe/ObserveSidebar";
import { RightRail } from "../../components/observe/RightRail";
import { Drawer } from "../../components/observe/Drawer";
import { AgentRoster } from "../../components/observe/AgentRoster";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const ACTIVE_WINDOW_MS = 4000;

type DrawerKind = "agents" | "activity" | "controls" | null;

export default function Observe() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [streamEvents, setStreamEvents] = useState<LiveStreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [simClock, setSimClock] = useState(false);
  const [busyScenario, setBusyScenario] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [drawer, setDrawer] = useState<DrawerKind>(null);

  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Data loading --------------------------------------------------------
  const loadData = useCallback(async () => {
    const [postsData, agentsData, statsData] = await Promise.all([
      fetchPosts().catch(() => [] as Post[]),
      fetchAgents().catch(() => [] as Agent[]),
      fetchStats().catch(() => null),
    ]);
    setPosts(postsData);
    setAgents(agentsData);
    setStats(statsData);
    setIsLoading(false);
  }, []);

  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => loadData(), 350);
  }, [loadData]);

  useEffect(() => {
    loadData();
    fetchScenarios().then(setScenarios).catch(() => setScenarios([]));
  }, [loadData]);

  // --- SSE stream ----------------------------------------------------------
  useEffect(() => {
    let es: EventSource | null = null;
    const connect = () => {
      es = new EventSource(`${API_BASE}/api/stream`);
      es.onopen = () => setIsConnected(true);
      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as LiveStreamEvent;
          setStreamEvents((prev) => [parsed, ...prev.slice(0, 119)]);
          if (parsed.type === "FEED_UPDATED") scheduleReload();
        } catch {
          /* keepalive / parse noise */
        }
      };
      es.onerror = () => {
        setIsConnected(false);
        es?.close();
        setTimeout(connect, 3000);
      };
    };
    connect();
    return () => es?.close();
  }, [scheduleReload]);

  // Wall-clock tick so agent status decays to IDLE without new events.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // --- Autonomous simulation clock ----------------------------------------
  useEffect(() => {
    if (simClock && scenarios.length > 0) {
      clockTimerRef.current = setInterval(() => {
        const sc = scenarios[Math.floor(Math.random() * scenarios.length)];
        triggerSimulation(sc.id).catch(() => {});
      }, 9000);
    }
    return () => {
      if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    };
  }, [simClock, scenarios]);

  // --- Derived: per-agent live status -------------------------------------
  const statusMap = useMemo(() => {
    const map: Record<string, AgentStatus> = {};
    for (const evt of streamEvents) {
      const age = nowTick - new Date(evt.timestamp).getTime();
      if (age > ACTIVE_WINDOW_MS) continue;
      if (evt.type === "AGENT_REASONING_COMPLETED") {
        const h = evt.payload.agentHandle;
        if (!map[h] && evt.payload.action !== "IGNORE") map[h] = "RESPONDING";
      } else if (evt.type === "DISCOVERY_EVALUATED") {
        for (const s of evt.payload.scores) {
          const h = s.agentHandle;
          if (!map[h] && s.thresholdPassed && s.guardrailStatus === "PASSED") map[h] = "EVALUATING";
        }
      }
    }
    return map;
  }, [streamEvents, nowTick]);

  // --- Derived: rationale pills keyed by postId ---------------------------
  const reasoningByPost = useMemo(() => {
    const map: Record<string, ReasonEntry[]> = {};
    for (const evt of streamEvents) {
      if (evt.type !== "AGENT_REASONING_COMPLETED") continue;
      const { postId, agentHandle, action, reactionType, reason } = evt.payload;
      if (action === "IGNORE") continue;
      const list = (map[postId] ||= []);
      if (list.length < 4) list.push({ handle: agentHandle, action, reactionType, reason });
    }
    return map;
  }, [streamEvents]);

  // --- Handlers ------------------------------------------------------------
  const handleInject = async (scenarioId: string) => {
    setBusyScenario(scenarioId);
    try {
      await triggerSimulation(scenarioId);
    } catch (e) {
      console.warn("Scenario injection failed:", (e as Error).message);
    } finally {
      setTimeout(() => setBusyScenario(null), 600);
    }
  };

  const handleReset = async () => {
    if (!confirm("Flush all posts, comments, and telemetry counters?")) return;
    setIsResetting(true);
    setSimClock(false);
    try {
      await resetSystem();
      setStreamEvents([]);
      await loadData();
    } finally {
      setIsResetting(false);
    }
  };

  const close = () => setDrawer(null);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] justify-center gap-0 px-0 sm:px-4">
      <ObserveSidebar
        agentsCount={agents.length}
        isConnected={isConnected}
        onOpenAgents={() => setDrawer("agents")}
        onOpenActivity={() => setDrawer("activity")}
        onOpenControls={() => setDrawer("controls")}
      />

      {/* Center feed */}
      <main className="flex min-w-0 max-w-[640px] flex-1 flex-col border-x border-x-border">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-x-border bg-x-bg/80 px-4 py-3 backdrop-blur-md">
          <div>
            <h1 className="text-[19px] font-bold tracking-tight text-x-primary">Autonomous feed</h1>
            <p className="text-[12px] text-x-secondary">Agents post, evaluate, and reply — live.</p>
          </div>
          <button
            onClick={() => setDrawer("controls")}
            className="rounded-full bg-x-accent px-4 py-1.5 text-[14px] font-bold text-black transition-colors hover:bg-x-accent-hover"
          >
            Inject event
          </button>
        </header>

        <Timeline posts={posts} isLoading={isLoading} reasoningByPost={reasoningByPost} />
      </main>

      <RightRail
        stats={stats}
        agents={agents}
        statusMap={statusMap}
        onOpenActivity={() => setDrawer("activity")}
        onOpenAgents={() => setDrawer("agents")}
      />

      {/* Drawers */}
      <Drawer
        open={drawer === "agents"}
        onClose={close}
        title="Enterprise agents"
        subtitle={`${agents.length} autonomous participants`}
      >
        <AgentRoster agents={agents} statusMap={statusMap} />
      </Drawer>

      <Drawer
        open={drawer === "activity"}
        onClose={close}
        title="Live activity"
        subtitle={isConnected ? "Connected · streaming decisions" : "Offline — reconnecting"}
      >
        <TelemetryPanel events={streamEvents} stats={stats} isConnected={isConnected} />
      </Drawer>

      <Drawer
        open={drawer === "controls"}
        onClose={close}
        title="Controls"
        subtitle="Inject a scenario, run the clock, or reset"
      >
        <OrchestratorBar
          scenarios={scenarios}
          onInject={handleInject}
          busyScenario={busyScenario}
          simClock={simClock}
          onToggleClock={() => setSimClock((v) => !v)}
          onReset={handleReset}
          isResetting={isResetting}
          embedded
        />
      </Drawer>
    </div>
  );
}
