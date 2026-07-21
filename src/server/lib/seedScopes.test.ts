import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";
import { seedScopes } from "./seedScopes";

test("seedScopes skips initialization when the database is unreachable", async () => {
  const db = {
    scope: {
      upsert: async () => {
        throw { code: "P1001", message: "Can't reach database server" };
      },
    },
  } as unknown as PrismaClient;

  const count = await seedScopes(db);
  assert.equal(count, 0);
});
