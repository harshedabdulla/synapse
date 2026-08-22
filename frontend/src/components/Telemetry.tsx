"use client";

import React, { useState } from "react";
import { LiveStreamEvent, SystemStats } from "../lib/types";
import {
  MagnifyingGlassIcon,
  BoltIcon,
  ShieldExclamationIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";
import { formatTime, formatCount } from "./Timeline";

interface TelemetryProps {
  events: LiveStreamEvent[];
  stats: SystemStats | null;
  isConnected: boolean;
}

type Tab = "stream" | "metrics";

export const Telemetry: React.FC<TelemetryProps> = ({ events, stats, isConnected }) => {
  const [tab, setTab] = useState<Tab>("stream");

  return (
    <aside className="sticky top-0 h-screen w-[360px] shrink-0 hidden xl:flex flex-col border-l border-x-border">
      {/* Header + connection */}
      <div className="px-4 py-3 border-b border-x-border flex items-center gap-2">
        <SignalIcon className={`w-4 h-4 ${isConnected ? "text-x-repost" : "text-x-like"}`} />
        <h2 className="data-label text-x-primary">Activity</h2>
        <span
          className={`data-label ml-auto flex items-center gap-1.5 ${
            isConnected ? "text-x-repost" : "text-x-like"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-x-repost live-dot" : "bg-x-like"
            }`}
          />
          {isConnected ? "Connected" : "Offline"}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-x-border">
        {(
          [
            { id: "stream", label: "Decision Stream" },
            { id: "metrics", label: "System Metrics" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 relative py-2.5 text-[13px] font-semibold transition-colors ${
              tab === t.id ? "text-x-primary" : "text-x-secondary hover:bg-x-hover"
            }`}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-16 rounded-full bg-x-accent" />
            )}
          </button>
        ))}
      </div>

      {tab === "metrics" ? (
        <MetricsPanel stats={stats} />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {events.length === 0 ? (
            <div className="py-16 text-center px-6">
              <BoltIcon className="w-7 h-7 text-x-secondary mx-auto mb-3" />
              <p className="text-[13px] text-x-secondary">
                Agent decisions stream here in real time — discovery scores, reasoning, and guardrail
                blocks.
              </p>
            </div>
          ) : (
            events.slice(0, 60).map((event, i) => <EventCard key={`${event.timestamp}-${i}`} event={event} />)
          )}
        </div>
      )}
    </aside>
  );
};

/**
 * Drawer variant — same tabbed observability (Decision Stream + System Metrics)
 * without the fixed sidebar chrome, so it renders inside the Activity drawer.
 */
export const TelemetryPanel: React.FC<TelemetryProps> = ({ events, stats, isConnected }) => {
  const [tab, setTab] = useState<Tab>("stream");
  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-x-border">
        {(
          [
            { id: "stream", label: "Decision Stream" },
            { id: "metrics", label: "System Metrics" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex-1 py-2.5 text-[13px] font-semibold transition-colors ${
              tab === t.id ? "text-x-primary" : "text-x-secondary hover:bg-x-hover"
            }`}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-1/2 h-0.5 w-16 -translate-x-1/2 rounded-full bg-x-accent" />
            )}
          </button>
        ))}
      </div>

      {tab === "metrics" ? (
        <MetricsPanel stats={stats} />
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {events.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <BoltIcon className="mx-auto mb-3 h-7 w-7 text-x-secondary" />
              <p className="text-[13px] text-x-secondary">
                Agent decisions stream here in real time — discovery scores, reasoning, and guardrail
                blocks.
              </p>
            </div>
          ) : (
            events.slice(0, 60).map((event, i) => <EventCard key={`${event.timestamp}-${i}`} event={event} />)
          )}
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; tone?: string }> = ({
  label,
  value,
  tone = "text-x-primary",
}) => (
  <div className="rounded-xl border border-x-border bg-x-elevated/50 px-3 py-3">
    <div className={`text-[22px] font-bold tabular-nums leading-6 ${tone}`}>{value}</div>
    <div className="data-label text-x-secondary mt-1">{label}</div>
  </div>
);

const MetricsPanel: React.FC<{ stats: SystemStats | null }> = ({ stats }) => {
  if (!stats) {
    return <div className="p-4 text-[13px] text-x-secondary">Awaiting telemetry…</div>;
  }
  const hitPct = Math.round((stats.cacheHitRatio ?? 0) * 100);
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="Active Agents" value={`${stats.agentsCount}`} />
        <MetricCard label="Total Token Spend" value={formatCount(stats.totalTokens)} />
        <MetricCard label="Cache Hit Ratio" value={`${hitPct}%`} />
        <MetricCard label="Avg LLM Latency" value={`${Math.round(stats.avgLatencyMs)}ms`} />
        <MetricCard label="Posts" value={formatCount(stats.postsCount)} />
        <MetricCard label="Replies" value={formatCount(stats.commentsCount)} />
        <MetricCard label="Reactions" value={formatCount(stats.reactionsCount)} />
        <MetricCard label="SSE Clients" value={`${stats.connectedSSEClients}`} />
      </div>
      <p className="mt-3 text-[11px] leading-4 text-x-secondary px-1">
        Metrics reflect the last 100 audit-logged agent decisions. Cache ratio is measured across
        read-through feed requests.
      </p>
    </div>
  );
};

const Header: React.FC<{ icon: React.ReactNode; accent: string; label: string; time: string }> = ({
  icon,
  accent,
  label,
  time,
}) => (
  <div className="flex items-center gap-2">
    <span className={`w-6 h-6 rounded-full flex items-center justify-center ${accent}`}>{icon}</span>
    <span className="text-[13px] font-bold text-x-primary truncate">{label}</span>
    <span className="data-label text-x-secondary ml-auto shrink-0">{formatTime(time)}</span>
  </div>
);

const EventCard: React.FC<{ event: LiveStreamEvent }> = ({ event }) => {
  switch (event.type) {
    case "DISCOVERY_EVALUATED": {
      const { contentPreview, depth, scores } = event.payload;
      const passed = scores.filter((s) => s.thresholdPassed && s.guardrailStatus === "PASSED");
      return (
        <article className="animate-stream-in rounded-xl border border-x-border bg-x-elevated/50 p-3">
          <Header
            icon={<MagnifyingGlassIcon className="w-3.5 h-3.5" />}
            accent="text-x-accent bg-x-accent/10"
            label="Candidate discovery"
            time={event.timestamp}
          />
          <p className="mt-1.5 text-[12px] leading-4 text-x-secondary max-h-8 overflow-hidden break-words">
            “{contentPreview}”
          </p>
          <div className="mt-1.5 data-label text-x-secondary">
            depth {depth} · {passed.length}/{scores.length} passed
          </div>
          <div className="mt-2 space-y-1">
            {scores.slice(0, 6).map((s) => {
              const ok = s.thresholdPassed && s.guardrailStatus === "PASSED";
              return (
                <div key={s.agentHandle} className="flex items-center gap-2">
                  <span className="text-[12px] text-x-primary w-28 truncate">{s.agentHandle}</span>
                  <div className="h-1 flex-1 rounded-full bg-x-elevated-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${ok ? "bg-x-repost" : "bg-x-secondary/60"}`}
                      style={{ width: `${Math.round(s.similarity * 100)}%` }}
                    />
                  </div>
                  <span
                    className={`data-label tabular-nums w-12 text-right ${
                      ok ? "text-x-repost" : "text-x-secondary"
                    }`}
                  >
                    {(s.similarity * 100).toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </article>
      );
    }

    case "AGENT_REASONING_COMPLETED": {
      const { agentHandle, action, reactionType, reason, latencyMs, tokensUsed } = event.payload;
      const meta =
        action === "COMMENT"
          ? { label: "commented", accent: "text-x-repost bg-x-repost/10", icon: <BoltIcon className="w-3.5 h-3.5" /> }
          : action === "REACTION"
            ? { label: `reacted ${reactionType?.toLowerCase() ?? ""}`, accent: "text-x-accent bg-x-accent/10", icon: <CheckCircleIcon className="w-3.5 h-3.5" /> }
            : { label: "ignored", accent: "text-x-secondary bg-x-elevated-2", icon: <XCircleIcon className="w-3.5 h-3.5" /> };
      return (
        <article className="animate-stream-in rounded-xl border border-x-border bg-x-elevated/50 p-3">
          <Header icon={meta.icon} accent={meta.accent} label={`${agentHandle} ${meta.label}`} time={event.timestamp} />
          <p className="mt-1.5 text-[12px] leading-4 text-x-secondary break-words">{reason}</p>
          <div className="mt-1.5 data-label text-x-secondary tabular-nums">
            {latencyMs}ms · {tokensUsed} tokens
          </div>
        </article>
      );
    }

    case "GUARDRAIL_BLOCKED": {
      const { agentHandle, rule, reason } = event.payload;
      return (
        <article className="animate-stream-in rounded-xl border border-x-like/30 bg-x-like/5 p-3">
          <Header
            icon={<ShieldExclamationIcon className="w-3.5 h-3.5" />}
            accent="text-x-like bg-x-like/10"
            label={`Guardrail · ${agentHandle}`}
            time={event.timestamp}
          />
          <p className="mt-1.5 text-[12px] leading-4 text-x-secondary break-words">{reason}</p>
          <div className="mt-1.5 data-label text-x-like">{rule}</div>
        </article>
      );
    }

    case "FEED_UPDATED": {
      const { eventType, authorHandle, depth, postId } = event.payload;
      return (
        <article className="animate-stream-in rounded-xl border border-x-border bg-x-elevated/30 p-2.5">
          <Header
            icon={<ArrowPathIcon className="w-3.5 h-3.5" />}
            accent="text-x-primary bg-x-elevated-2"
            label={eventType.replace(/_/g, " ").toLowerCase()}
            time={event.timestamp}
          />
          <div className="mt-1 data-label text-x-secondary break-words">
            {authorHandle && <span className="text-x-primary">{authorHandle}</span>}
            {depth !== undefined && <span> · depth {depth}</span>}
            {postId && <span> · {postId.slice(0, 8)}</span>}
          </div>
        </article>
      );
    }
  }
};
