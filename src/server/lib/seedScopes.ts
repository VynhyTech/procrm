import { readFileSync } from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";

interface ScopeDefinition {
  name: string;
  description: string;
  isSystem: boolean;
  orgAssignable: boolean;
}

export async function seedScopes(db: PrismaClient): Promise<number> {
  // Resolved via process.cwd() rather than __dirname so this works the same whether
  // run through tsx (dev) or the compiled dist output (prod), regardless of nesting.
  const scopesPath = path.resolve(process.cwd(), "scopes.json");
  const { scopes } = JSON.parse(readFileSync(scopesPath, "utf-8")) as { scopes: ScopeDefinition[] };

  for (const scope of scopes) {
    await db.scope.upsert({
      where: { name: scope.name },
      update: {
        description: scope.description,
        isSystem: scope.isSystem,
        orgAssignable: scope.orgAssignable,
      },
      create: scope,
    });
  }

  return scopes.length;
}
