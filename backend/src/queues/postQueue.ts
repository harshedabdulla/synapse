import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis";

const connection = getRedisConnectionOptions();

export const candidateDiscoveryQueue = new Queue("candidate-discovery-queue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const agentActionQueue = new Queue("agent-action-queue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});
