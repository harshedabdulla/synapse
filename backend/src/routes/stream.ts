import { Router, Request, Response } from "express";
import { sseManager } from "../services/sse";

export const streamRouter = Router();

/**
 * GET /api/stream - Real-time Server-Sent Events stream
 */
streamRouter.get("/", (req: Request, res: Response) => {
  sseManager.addClient(res);
});
