import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Guardrail/idempotency suites mock Redis + Prisma, so no live infra is required.
  },
});
