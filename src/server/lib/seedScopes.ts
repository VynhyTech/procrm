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

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : undefined;

    if (code === "P1001" || code === "P1002" || message.includes("Can't reach database server") || message.includes("ECONNREFUSED")) {
      console.warn("Skipping scope seeding because the database is unavailable:", message);
      return 0;
    }

    throw error;
  }

  return scopes.length;
}
