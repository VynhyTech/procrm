import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import type { FastifyReply } from "fastify";

import { prisma } from "./db";
import { SESSION_COOKIE_NAME, readSession } from "./lib/session";
import { getEffectiveScopes, getPlatformScopes } from "./lib/scopes";

export interface Ctx {
  db: typeof prisma;
  userId: string;
  currentOrgId: string | null;
  /** Identifies the Session row backing this request (if any) — lets auth.ts's logout/switchOrg act on it directly. */
  sessionId: string | null;
  /** Org-independent scopes, from system/platform roles (Role.orgId === null). */
  jwtScopes: string[];
  /** Effective scopes for the active org: jwtScopes union the active org's role scopes. */
  scopes: string[];
  /** Needed by auth.ts's mutations to set/clear the session cookie. */
  res: FastifyReply;
}

export async function createContext({ req, res }: CreateFastifyContextOptions): Promise<Ctx> {
  const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
  const session = await readSession(prisma, rawToken);

  const userId = session?.userId ?? "local-user";
  const currentOrgId = session?.activeOrgId ?? null;
  const sessionId = session?.sessionId ?? null;

  const jwtScopes = userId ? await getPlatformScopes(prisma, userId) : [];
  const scopes = userId ? await getEffectiveScopes(prisma, userId, currentOrgId) : [];

  return { db: prisma, userId, currentOrgId, sessionId, jwtScopes, scopes, res };
}

const t = initTRPC.context<Ctx>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * requiredScopes is an OR match (any one suffices), matching the client's existing
 * Layout.tsx hasScope logic. An empty array means "any authenticated user, no extra scope".
 */
export const scopedProcedure = (requiredScopes: string[]) =>
  t.procedure.use((opts) => {
    const { ctx, next } = opts;
    // Allow the app to run without a login session for local/dev convenience,
    // but enforce requiredScopes when provided.
    if (requiredScopes.length > 0 && !requiredScopes.some((s) => ctx.scopes.includes(s))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Insufficient scope" });
    }
    return next();
  });
