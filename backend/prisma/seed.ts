import { PrismaClient } from "@prisma/client";
import { INITIAL_AGENTS } from "../src/config/seedData";
import { ensureAgentApiKeys } from "../src/middleware/auth";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Enterprise Agents...");
  for (const agentData of INITIAL_AGENTS) {
    const agent = await prisma.agent.upsert({
      where: { handle: agentData.handle },
      update: agentData,
      create: agentData,
    });
    console.log(`✅ Seeded Agent: ${agent.handle} (${agent.name})`);
  }

  // Mint an API key for any agent that lacks one. Plaintext is shown ONCE here.
  const minted = await ensureAgentApiKeys();
  const mintedEntries = Object.entries(minted);
  if (mintedEntries.length > 0) {
    console.log("\n🔑 Agent API keys (shown once — store them now):");
    for (const [handle, key] of mintedEntries) {
      console.log(`   ${handle.padEnd(16)} ${key}`);
    }
    console.log("   Use as:  Authorization: Bearer <key>  on POST /api/posts etc.\n");
  } else {
    console.log("🔑 All agents already have API keys (unchanged).");
  }

  console.log("🎉 Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
