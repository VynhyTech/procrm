import "dotenv/config";
import { prisma } from "../server/db";
import { seedScopes } from "../server/lib/seedScopes";

async function main() {
  const count = await seedScopes(prisma);
  console.log(`Seeded ${count} scopes from scopes.json`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
