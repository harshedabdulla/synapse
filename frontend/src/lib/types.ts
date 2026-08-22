export interface Agent {
  id: string;
  handle: string;
  name: string;
  organization: string;
  avatarUrl?: string;
  systemPrompt: string;
  interests: string;
  interestsList?: string[];
  hourlyPostBudget: number;
  hourlyCommentBudget: number;
  createdAt: string;
  stats?: {
    totalPosts: number;
    totalComments: number;
    totalReactions: number;
    totalTokensUsed: number;
    hourlyPostsUsed: number;
    hourlyCommentsUsed: number;
    hourlyPostRemaining: number;
    hourlyCommentRemaining: number;
  };
}

export interface Reaction {
  id: string;
  postId: string;
  agentId: string;
  type: "LIKE" | "AGREE" | "DISAGREE";
  createdAt: string;
  agent?: Agent;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  author: Agent;
  parentId: string | null;
  content: string;
  threadDepth: number;
  createdAt: string;
  children?: Comment[];
}

export interface Post {
  id: string;
  authorId: string;
  author: Agent;
  content: string;
  threadDepth: number;
  createdAt: string;
  reactions: Reaction[];
  comments: Comment[];
  commentTree?: Comment[];
  commentsCount?: number;
  reactionsCount?: number;
}

export interface AuditLog {
  id: string;
  agentId: string;
  agent: Agent;
  postId: string;
  post?: {
    id: string;
    content: string;
  };
  action: string;
  decisionReason: string;
  latencyMs: number;
  tokensUsed: number;
  timestamp: string;
}

export interface CandidateScore {
  agentHandle: string;
  agentName: string;
  similarity: number;
  thresholdPassed: boolean;
  guardrailStatus: "PASSED" | "BLOCKED_RATE_LIMIT" | "BLOCKED_THREAD_QUOTA" | "BLOCKED_DEPTH";
  guardrailReason?: string;
}

export interface SSEDiscoveryEvent {
  type: "DISCOVERY_EVALUATED";
  payload: {
    postId: string;
    contentPreview: string;
    depth: number;
    scores: CandidateScore[];
    timestamp: string;
  };
  timestamp: string;
}

export interface SSEReasoningEvent {
  type: "AGENT_REASONING_COMPLETED";
  payload: {
    agentHandle: string;
    postId: string;
    action: "COMMENT" | "REACTION" | "IGNORE";
    reactionType?: "LIKE" | "AGREE" | "DISAGREE";
    reason: string;
    latencyMs: number;
    tokensUsed: number;
  };
  timestamp: string;
}

export interface SSEGuardrailEvent {
  type: "GUARDRAIL_BLOCKED";
  payload: {
    agentHandle: string;
    postId: string;
    rule: string;
    reason: string;
  };
  timestamp: string;
}

export interface SSEFeedUpdateEvent {
  type: "FEED_UPDATED";
  payload: {
    eventType: string;
    postId?: string;
    commentId?: string;
    authorHandle?: string;
    depth?: number;
  };
  timestamp: string;
}

export type LiveStreamEvent =
  | SSEDiscoveryEvent
  | SSEReasoningEvent
  | SSEGuardrailEvent
  | SSEFeedUpdateEvent;

export interface SystemStats {
  postsCount: number;
  commentsCount: number;
  reactionsCount: number;
  agentsCount: number;
  totalTokens: number;
  avgLatencyMs: number;
  cacheHitRatio?: number;
  connectedSSEClients: number;
}

export type AgentStatus = "IDLE" | "EVALUATING" | "RESPONDING";

export interface SimulationScenario {
  id: string;
  label: string;
  handle: string;
  description: string;
}
