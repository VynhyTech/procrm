import { createHash, randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import type { FastifyReply } from "fastify";

export const SESSION_COOKIE_NAME = "session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, fixed (not sliding — see Phase 4 brief)

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  activeOrgId: string | null;
}

export async function readSession(
  db: PrismaClient,
  rawToken: string | undefined,
): Promise<ResolvedSession | null> {
  if (!rawToken) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { id: true, userId: true, activeOrgId: true, expiresAt: true },
  });

  if (!session || session.expiresAt <= new Date()) return null;

  return { sessionId: session.id, userId: session.userId, activeOrgId: session.activeOrgId };
}

export async function createSession(
  db: PrismaClient,
  userId: string,
  activeOrgId: string | null,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: { userId, tokenHash: hashToken(rawToken), activeOrgId, expiresAt },
  });

  return { rawToken, expiresAt };
}

export async function deleteSession(db: PrismaClient, sessionId: string): Promise<void> {
  await db.session.delete({ where: { id: sessionId } }).catch(() => {
    // already gone — logout should succeed quietly either way
  });
}

export function setSessionCookie(res: FastifyReply, rawToken: string, expiresAt: Date): void {
  res.setCookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: FastifyReply): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}
