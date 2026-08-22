import { PrismaClient } from "@prisma/client";
import { INITIAL_AGENTS } from "../src/config/seedData";

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
