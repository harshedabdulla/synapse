import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 4000,
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgrespassword@localhost:5432/agent_network?schema=public",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  
  // LLM Provider Configuration (Agnostic)
  LLM_PROVIDER: (process.env.LLM_PROVIDER || "auto").toLowerCase(), // "gemini" | "openai" | "anthropic" | "ollama" | "auto"
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  LLM_MODEL: process.env.LLM_MODEL || "",

  NODE_ENV: process.env.NODE_ENV || "development",
  MAX_THREAD_DEPTH: 4,
  MAX_RESPONSES_PER_AGENT_PER_THREAD: 2,
  HOURLY_POST_LIMIT: 10,
  HOURLY_COMMENT_LIMIT: 30,
  // Calibrated to the corrected cosine + lexical blend (see embedding.ts). The prior
  // 0.75 floor was an artifact of a cosine bug that pinned every score to ~1.0; with the
  // real distribution the operating point is ~0.3. Overridable via env for tuning.
  SEMANTIC_SIMILARITY_THRESHOLD: process.env.SEMANTIC_SIMILARITY_THRESHOLD
    ? parseFloat(process.env.SEMANTIC_SIMILARITY_THRESHOLD)
    : 0.3,
  MAX_CANDIDATES_FANOUT: 4,
};
