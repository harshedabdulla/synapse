import { Response } from "express";
import { randomUUID } from "crypto";
import { redis } from "../config/redis";

export interface SSEEvent {
  type: "DISCOVERY_EVALUATED" | "GUARDRAIL_BLOCKED" | "AGENT_REASONING_COMPLETED" | "FEED_UPDATED" | "SYSTEM_METRICS" | "LOG";
  payload: any;
  timestamp: string;
}

// Cross-instance relay channel. Every backend instance subscribes and relays
// peer events to its own SSE clients, so a client connected to instance A still
// receives events emitted on instance B.
const SSE_CHANNEL = "sse:events";

class SSEManager {
  private clients: Set<Response> = new Set();
  private eventHistory: SSEEvent[] = [];
  private maxHistory = 100;
  // Identifies this process so we don't re-deliver our own relayed events.
  private instanceId = randomUUID();
  // Dedicated subscriber connection — a connection in subscribe mode cannot
  // issue normal commands, so it must be separate from the shared `redis`.
  private subscriber = redis.duplicate();

  constructor() {
    // Keepalive ping every 15s (local only — never relayed).
    setInterval(() => {
      this.broadcastRaw(": keepalive\n\n");
    }, 15000);

    this.initRelay();
  }

  /** Subscribe to the relay channel and deliver peer events to local clients. */
  private initRelay() {
    this.subscriber.on("error", () => {
      // Relay is best-effort; local delivery still works while Redis is down.
    });
    this.subscriber.subscribe(SSE_CHANNEL).catch(() => {
      // Will auto-resubscribe once the connection recovers.
    });
    this.subscriber.on("message", (channel: string, message: string) => {
      if (channel !== SSE_CHANNEL) return;
      try {
        const { from, event } = JSON.parse(message) as { from: string; event: SSEEvent };
        // Skip our own events — the origin already delivered them locally.
        if (from === this.instanceId) return;
        this.deliverLocal(event);
      } catch {
        // ignore malformed relay payloads
      }
    });
  }

  public addClient(res: Response) {
    this.clients.add(res);

    // Send headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // Send recent event history to newly connected client
    for (const evt of this.eventHistory.slice(-20)) {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    }

    res.on("close", () => {
      this.clients.delete(res);
    });
  }

  public broadcast(type: SSEEvent["type"], payload: any) {
    const event: SSEEvent = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    // 1. Deliver to THIS instance's clients immediately — real-time and
    //    independent of Redis, so single-instance dev works with Redis offline.
    this.deliverLocal(event);

    // 2. Relay to peer instances (best-effort). Tagged with our instanceId so
    //    the round-trip never re-delivers the event to our own clients.
    redis
      .publish(SSE_CHANNEL, JSON.stringify({ from: this.instanceId, event }))
      .catch(() => {
        // Redis down — peers miss this event; local clients already have it.
      });
  }

  /** Append to history and write to every local client. */
  private deliverLocal(event: SSEEvent) {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }
    this.broadcastRaw(`data: ${JSON.stringify(event)}\n\n`);
  }

  private broadcastRaw(data: string) {
    for (const client of this.clients) {
      try {
        client.write(data);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  public getHistory(): SSEEvent[] {
    return this.eventHistory;
  }

  public clearHistory() {
    this.eventHistory = [];
  }
}

export const sseManager = new SSEManager();
