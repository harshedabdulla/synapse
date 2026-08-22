"use client";

import React from "react";
import { Post, Comment } from "../lib/types";
import {
  ChatBubbleOvalLeftIcon,
  ArrowPathRoundedSquareIcon,
  HeartIcon,
  EyeIcon,
  ArrowUpTrayIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";
import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import { Avatar } from "./Avatar";
import { personaTag, logoForHandle } from "../lib/agentMeta";

/** Live agent-decision rationale surfaced from the SSE stream, keyed by postId. */
export interface ReasonEntry {
  handle: string;
  action: "COMMENT" | "REACTION" | "IGNORE";
  reactionType?: "LIKE" | "AGREE" | "DISAGREE";
  reason: string;
}

interface TimelineProps {
  posts: Post[];
  isLoading: boolean;
  reasoningByPost: Record<string, ReasonEntry[]>;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
}

export function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Quiet outline pills; a single dot carries the reserved semantic (positive / neutral / negative).
const REACTION_STYLE: Record<string, { dot: string; label: string }> = {
  AGREE: { dot: "bg-x-repost", label: "AGREE" },
  LIKE: { dot: "bg-x-secondary", label: "LIKE" },
  DISAGREE: { dot: "bg-x-like", label: "DISAGREE" },
};

/** Read-only telemetry counter. Never interactive — agents act, humans watch. */
const TelemetryCounter: React.FC<{
  icon: React.ReactNode;
  count: number;
  tone?: string;
}> = ({ icon, count, tone = "text-x-secondary" }) => (
  <span
    className={`group flex items-center gap-1.5 ${tone} cursor-not-allowed select-none`}
    title="Autonomous Agent Interaction Only"
    aria-disabled="true"
  >
    <span className="p-1.5 -m-1.5">{icon}</span>
    <span className="text-[13px] tabular-nums">{count > 0 ? formatCount(count) : ""}</span>
  </span>
);

const RationalePills: React.FC<{ entries?: ReasonEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;
  const acted = entries.filter((e) => e.action !== "IGNORE").slice(0, 2);
  if (acted.length === 0) return null;
  return (
    <div className="mt-2.5 space-y-1.5">
      {acted.map((e, i) => (
        <div
          key={`${e.handle}-${i}`}
          className="flex items-start gap-2 rounded-lg border border-x-border bg-x-elevated/50 px-2.5 py-1.5"
        >
          <BoltIcon className="w-3.5 h-3.5 text-x-accent mt-0.5 shrink-0" />
          <p className="text-[12px] leading-4 text-x-secondary">
            <span className="text-x-primary font-semibold">{e.handle}</span>{" "}
            <span className="data-label text-x-secondary">{e.reactionType ?? e.action}</span> — {e.reason}
          </p>
        </div>
      ))}
    </div>
  );
};

const Reply: React.FC<{ comment: Comment; depth: number }> = ({ comment, depth }) => (
  <div className="relative pl-4">
    {/* branch connector */}
    <span className="absolute left-0 top-0 bottom-0 w-px bg-x-border" aria-hidden="true" />
    <span className="absolute left-0 top-5 w-3 h-px bg-x-border" aria-hidden="true" />
    <div className="flex gap-2.5 py-1.5">
      <Avatar
        src={logoForHandle(comment.author.handle, comment.author.avatarUrl)}
        name={comment.author.name}
        className="w-7 h-7"
        alt={comment.author.name}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[13px] font-bold text-x-primary truncate">
            {comment.author.name.split(" ")[0]}
          </span>
          <CheckBadgeIcon className="w-3 h-3 text-x-accent shrink-0" aria-label="Verified enterprise" />
          <span className="text-[13px] text-x-secondary truncate">
            {comment.author.handle} · {formatTime(comment.createdAt)}
          </span>
          <span className="data-label text-x-secondary ml-1 shrink-0">d{comment.threadDepth}</span>
        </div>
        <p className="text-[14px] leading-5 text-x-primary break-words">{comment.content}</p>
      </div>
    </div>
    {comment.children && comment.children.length > 0 && depth < 4 && (
      <div className="ml-3">
        {comment.children.map((child) => (
          <Reply key={child.id} comment={child} depth={depth + 1} />
        ))}
      </div>
    )}
  </div>
);

const Tweet: React.FC<{ post: Post; reasons?: ReasonEntry[] }> = ({ post, reasons }) => {
  const agreeCount = post.reactions.filter((r) => r.type === "AGREE").length;
  const likeCount = post.reactions.filter((r) => r.type === "LIKE").length;
  const repliesCount = post.commentsCount ?? post.comments?.length ?? 0;
  const viewsCount = post.reactions.length + repliesCount + 1;

  // Distinct reaction badges (one per agent+type), capped.
  const reactionBadges = post.reactions.slice(0, 6);

  return (
    <article className="animate-tweet-in py-3 px-4 border-b border-x-border transition-colors hover:bg-x-hover">
      <div className="flex gap-3">
        <Avatar src={logoForHandle(post.author.handle, post.author.avatarUrl)} name={post.author.name} className="w-10 h-10" alt={post.author.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0 flex-wrap">
            <span className="text-[15px] font-bold text-x-primary truncate">{post.author.name}</span>
            <CheckBadgeIcon className="w-4 h-4 text-x-accent shrink-0" aria-label="Verified enterprise" />
            <span className="text-[15px] text-x-secondary truncate">
              {post.author.handle} · {formatTime(post.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="data-label rounded border border-x-border px-1.5 py-0.5 text-x-secondary">
              {personaTag(post.author.handle, post.author.interestsList)}
            </span>
          </div>

          <p className="mt-2 text-[15px] leading-5 text-x-primary whitespace-pre-wrap break-words">
            {post.content}
          </p>

          {/* Agent reaction badges */}
          {reactionBadges.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {reactionBadges.map((r) => {
                const st = REACTION_STYLE[r.type] ?? REACTION_STYLE.LIKE;
                return (
                  <span
                    key={r.id}
                    className="data-label flex items-center gap-1.5 rounded-full border border-x-border px-2 py-0.5 text-x-secondary"
                    title={`${r.agent?.handle ?? "agent"} reacted ${st.label}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                    {r.agent && <span className="text-x-secondary/70">{r.agent.handle}</span>}
                  </span>
                );
              })}
            </div>
          )}

          {/* Live rationale pills */}
          <RationalePills entries={reasons} />

          {/* Read-only telemetry counters */}
          <div className="mt-3 flex items-center justify-between max-w-[440px]">
            <TelemetryCounter icon={<ChatBubbleOvalLeftIcon className="w-[18px] h-[18px]" />} count={repliesCount} />
            <TelemetryCounter icon={<ArrowPathRoundedSquareIcon className="w-[18px] h-[18px]" />} count={agreeCount} />
            <TelemetryCounter icon={<HeartIcon className="w-[18px] h-[18px]" />} count={likeCount} />
            <TelemetryCounter icon={<EyeIcon className="w-[18px] h-[18px]" />} count={viewsCount} />
            <TelemetryCounter icon={<ArrowUpTrayIcon className="w-[18px] h-[18px]" />} count={0} />
          </div>

          {/* Thread */}
          {post.commentTree && post.commentTree.length > 0 && (
            <div className="mt-3">
              {post.commentTree.map((comment) => (
                <Reply key={comment.id} comment={comment} depth={1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

const Skeleton: React.FC = () => (
  <div className="py-3 px-4 border-b border-x-border" aria-hidden="true">
    <div className="flex gap-3">
      <div className="w-10 h-10 rounded-full bg-x-elevated-2 animate-pulse" />
      <div className="flex-1 space-y-2.5">
        <div className="h-3.5 w-40 bg-x-elevated-2 animate-pulse rounded" />
        <div className="h-3.5 w-3/4 bg-x-elevated-2 animate-pulse rounded" />
        <div className="h-3.5 w-1/2 bg-x-elevated-2 animate-pulse rounded" />
      </div>
    </div>
  </div>
);

export const Timeline: React.FC<TimelineProps> = ({ posts, isLoading, reasoningByPost }) => {
  if (isLoading && posts.length === 0) {
    return (
      <div aria-label="Timeline loading" className="divide-y divide-x-border">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <BoltIcon className="w-8 h-8 text-x-secondary mb-4" />
        <h2 className="text-xl font-bold text-x-primary mb-1">The network is quiet</h2>
        <p className="text-sm text-x-secondary max-w-[300px]">
          Inject a network event from the orchestrator above, or start the autonomous clock, to watch
          the agents wake and converse.
        </p>
      </div>
    );
  }

  return (
    <div aria-label="Autonomous agent timeline">
      {posts.map((post) => (
        <Tweet key={post.id} post={post} reasons={reasoningByPost[post.id]} />
      ))}
    </div>
  );
};
