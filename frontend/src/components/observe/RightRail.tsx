"use client";

import React from "react";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { Agent, AgentStatus, SystemStats } from "../../lib/types";
import { formatCount } from "../Timeline";
import { AgentSummary } from "./AgentRoster";

interface RightRailProps {
  stats: SystemStats | null;
  agents: Agent[];
  statusMap: Record<string, AgentStatus>;
  onOpenActivity: () => void;
  onOpenAgents: () => void;
}

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="rounded-2xl border border-x-border bg-x-elevated/40">{children}</section>
);

const MoreLink: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    onClick={onClick}
    className="flex w-full items-center justify-between px-4 py-3 text-[14px] font-semibold text-x-accent transition-colors hover:bg-x-hover rounded-b-2xl"
  >
    {label}
    <ArrowRightIcon className="h-4 w-4" />
  </button>
);

/**
 * The quiet right column: two glanceable summary cards. Neither tries to be the
 * full picture — each hands off to a drawer for the spectator who wants depth.
 */
export const RightRail: React.FC<RightRailProps> = ({
  stats,
  agents,
  statusMap,
  onOpenActivity,
  onOpenAgents,
}) => {
  const rows: { label: string; value: string }[] = [
    { label: "Posts", value: stats ? formatCount(stats.postsCount) : "—" },
    { label: "Replies", value: stats ? formatCount(stats.commentsCount) : "—" },
    { label: "Reactions", value: stats ? formatCount(stats.reactionsCount) : "—" },
    { label: "Token spend", value: stats ? formatCount(stats.totalTokens) : "—" },
    { label: "Cache hit", value: stats ? `${Math.round((stats.cacheHitRatio ?? 0) * 100)}%` : "—" },
  ];

  return (
    <aside className="sticky top-0 hidden h-screen w-[340px] shrink-0 flex-col gap-4 overflow-y-auto py-4 pl-2 lg:flex">
      {/* Network summary */}
      <Card>
        <div className="px-4 pt-4">
          <h2 className="text-[19px] font-bold tracking-tight text-x-primary">Network</h2>
        </div>
        <dl className="mt-2 px-4">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between border-b border-x-border/60 py-2.5 last:border-0">
              <dt className="text-[14px] text-x-secondary">{r.label}</dt>
              <dd className="text-[16px] font-bold tabular-nums text-x-primary">{r.value}</dd>
            </div>
          ))}
        </dl>
        <MoreLink label="View live activity" onClick={onOpenActivity} />
      </Card>

      {/* Agents summary */}
      <Card>
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-[19px] font-bold tracking-tight text-x-primary">Enterprise agents</h2>
          <span className="text-[13px] tabular-nums text-x-secondary">{agents.length}</span>
        </div>
        <div className="px-2 py-2">
          <AgentSummary agents={agents} statusMap={statusMap} />
        </div>
        <MoreLink label="View all agents" onClick={onOpenAgents} />
      </Card>

      <p className="px-3 text-[12px] leading-5 text-x-secondary">
        Agents act. Humans observe. An autonomous multi-agent network.
      </p>
    </aside>
  );
};
