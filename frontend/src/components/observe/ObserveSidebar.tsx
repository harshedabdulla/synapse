"use client";

import React from "react";
import Link from "next/link";
import {
  HomeIcon,
  QueueListIcon,
  UsersIcon,
  SignalIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import { SynapseGlyph } from "../SynapseLogo";

interface ObserveSidebarProps {
  agentsCount: number;
  isConnected: boolean;
  onOpenAgents: () => void;
  onOpenActivity: () => void;
  onOpenControls: () => void;
}

type Item = {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  badge?: React.ReactNode;
};

const NavButton: React.FC<{ item: Item }> = ({ item }) => {
  const inner = (
    <>
      <span className="relative shrink-0">
        {item.icon}
        {item.badge}
      </span>
      <span
        className={`hidden text-[17px] xl:inline ${
          item.active ? "font-bold text-x-primary" : "font-medium text-x-primary"
        }`}
      >
        {item.label}
      </span>
    </>
  );
  const cls = `group flex items-center gap-4 rounded-full px-3.5 py-2.5 transition-colors hover:bg-x-hover ${
    item.active ? "text-x-primary" : "text-x-primary"
  }`;
  return item.href ? (
    <Link href={item.href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={item.onClick} className={`${cls} w-full text-left`} aria-label={item.label}>
      {inner}
    </button>
  );
};

/**
 * The X-style rail: brand, primary nav, and a prominent action. The agent
 * roster and telemetry that used to crowd this column now live one click away
 * in slide-over drawers, so the rail stays quiet and scannable.
 */
export const ObserveSidebar: React.FC<ObserveSidebarProps> = ({
  agentsCount,
  isConnected,
  onOpenAgents,
  onOpenActivity,
  onOpenControls,
}) => {
  const items: Item[] = [
    { label: "Home", icon: <HomeIcon className="h-7 w-7" />, href: "/" },
    { label: "Feed", icon: <QueueListIcon className="h-7 w-7" />, active: true, href: "/observe" },
    {
      label: "Agents",
      icon: <UsersIcon className="h-7 w-7" />,
      onClick: onOpenAgents,
      badge: (
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-x-elevated-2 px-1.5 text-[10px] font-bold leading-4 text-x-secondary">
          {agentsCount}
        </span>
      ),
    },
    {
      label: "Activity",
      icon: <SignalIcon className="h-7 w-7" />,
      onClick: onOpenActivity,
      badge: isConnected ? (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-x-repost live-dot" />
      ) : null,
    },
    { label: "Controls", icon: <AdjustmentsHorizontalIcon className="h-7 w-7" />, onClick: onOpenControls },
  ];

  return (
    <aside className="no-scrollbar sticky top-0 flex h-screen w-[88px] shrink-0 flex-col overflow-y-auto px-2 py-4 xl:w-[260px] xl:px-3">
      {/* Brand */}
      <Link
        href="/"
        className="mb-4 flex items-center gap-2.5 rounded-full px-2.5 py-1.5 hover:bg-x-hover xl:px-3"
        aria-label="Synapse home"
      >
        <span className="text-x-accent">
          <SynapseGlyph className="h-8 w-8" />
        </span>
        <span className="hidden text-[20px] font-bold tracking-tight text-x-primary xl:inline font-display">
          Synapse
        </span>
      </Link>

      {/* Nav — the Controls item opens the inject/clock/reset drawer */}
      <nav className="flex flex-col gap-1">
        {items.map((it) => (
          <NavButton key={it.label} item={it} />
        ))}
      </nav>
    </aside>
  );
};
