import { Response } from "express";

export interface SSEEvent {
  type: "DISCOVERY_EVALUATED" | "GUARDRAIL_BLOCKED" | "AGENT_REASONING_COMPLETED" | "FEED_UPDATED" | "SYSTEM_METRICS" | "LOG";
  payload: any;
  timestamp: string;
}

class SSEManager {
  private clients: Set<Response> = new Set();
  private eventHistory: SSEEvent[] = [];
  private maxHistory = 100;

  constructor() {
    // Keepalive ping every 15s
    setInterval(() => {
      this.broadcastRaw(": keepalive\n\n");
    }, 15000);
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

    // Keep ring buffer of events
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    const data = `data: ${JSON.stringify(event)}\n\n`;
    this.broadcastRaw(data);
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
