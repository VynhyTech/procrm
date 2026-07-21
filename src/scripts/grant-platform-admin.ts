import "dotenv/config";
import { prisma } from "../server/db";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx src/scripts/grant-platform-admin.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new Error(`No user found with email ${email}`);

  const scope = await prisma.scope.findUnique({ where: { name: "tenants:manage" } });
  if (!scope) throw new Error("Scope 'tenants:manage' not found — run `npm run db:seed` first");

  let role = await prisma.role.findFirst({ where: { name: "Platform Admin", orgId: null } });
  if (!role) {
    role = await prisma.role.create({
      data: { name: "Platform Admin", description: "SaaS operator — manages tenants", isSystem: true, orgId: null },
    });
  }

  await prisma.roleScope.upsert({
    where: { roleId_scopeId: { roleId: role.id, scopeId: scope.id } },
    update: {},
    create: { roleId: role.id, scopeId: scope.id },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log(`Granted 'tenants:manage' (Platform Admin role) to ${email}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
