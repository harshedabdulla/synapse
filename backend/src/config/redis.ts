import Redis from "ioredis";
import { ENV } from "./env";

let hasLoggedRedisWarning = false;

export const redis = new Redis(ENV.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
  // Railway private networking is IPv6-only (redis.railway.internal). family: 0
  // enables dual-stack DNS so the internal host resolves; harmless for IPv4 hosts.
  family: 0,
  retryStrategy(times) {
    // Throttled exponential backoff
    const delay = Math.min(times * 500, 5000);
    return delay;
  },
});

redis.on("connect", () => {
  hasLoggedRedisWarning = false;
  console.log("⚡ Connected to Redis:", ENV.REDIS_URL);
});

redis.on("error", (err: any) => {
  if (!hasLoggedRedisWarning) {
    console.warn(`⚠️ Redis is offline at ${ENV.REDIS_URL}: ${err.code || err.message}`);
    console.warn("💡 Tip: Start Redis via 'docker-compose up' or 'docker run -d -p 6379:6379 redis:7-alpine'");
    hasLoggedRedisWarning = true;
  }
});

export const getRedisConnectionOptions = () => {
  const url = new URL(ENV.REDIS_URL);
  return {
    host: url.hostname || "localhost",
    port: parseInt(url.port || "6379", 10),
    password: url.password || undefined,
    username: url.username || undefined,
    maxRetriesPerRequest: null,
    // Dual-stack DNS so BullMQ resolves Railway's IPv6-only internal Redis host.
    family: 0,
  };
};
