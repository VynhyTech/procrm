import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { router, publicProcedure, scopedProcedure } from "../trpc";
import { hashPassword, verifyPassword, getDummyHash } from "../lib/passwords";
import {
  createSession,
  deleteSession,
  setSessionCookie,
  clearSessionCookie,
  hashToken,
} from "../lib/session";

const GENERIC_AUTH_ERROR = "Invalid email or password";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const authRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().optional(),
        inviteToken: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      const existing = await ctx.db.user.findFirst({
        where: { email },
        include: { credential: true },
      });

      if (existing?.credential) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
      }

      // A credential-less User row means this email was invited to an org (Phase 6) — claiming
      // it requires the matching, unexpired invite token, not just knowledge of the email.
      if (existing) {
        const tokenValid =
          input.inviteToken &&
          existing.inviteTokenHash === hashToken(input.inviteToken) &&
          existing.inviteTokenExpiresAt &&
          existing.inviteTokenExpiresAt > new Date();
        if (!tokenValid) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Invalid or expired invite" });
        }
      }

      const passwordHash = await hashPassword(input.password);

      const user = existing
        ? await ctx.db.user.update({
            where: { id: existing.id },
            data: {
              name: input.name ?? existing.name,
              credential: { create: { passwordHash } },
              inviteTokenHash: null,
              inviteTokenExpiresAt: null,
            },
          })
        : await ctx.db.user.create({
            data: {
              email,
              name: input.name,
              credential: { create: { passwordHash } },
            },
          });

      // If this signup just claimed an invite, land them in that org directly rather than
      // requiring a manual switch (mirrors login's existing membership lookup below).
      const membership = await ctx.db.organizationMember.findFirst({ where: { userId: user.id } });
      const { rawToken, expiresAt } = await createSession(ctx.db, user.id, membership?.orgId ?? null);
      setSessionCookie(ctx.res, rawToken, expiresAt);

      return { id: user.id, email: user.email, name: user.name };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      const user = await ctx.db.user.findFirst({
        where: { email },
        include: { credential: true },
      });

      // Always run a verify, even with no matching user/credential, so response latency
      // doesn't reveal whether the email is registered (timing side-channel defense).
      const hashToCheck = user?.credential?.passwordHash ?? (await getDummyHash());
      const valid = await verifyPassword(hashToCheck, input.password);

      if (!user?.credential || !valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: GENERIC_AUTH_ERROR });
      }

      const membership = await ctx.db.organizationMember.findFirst({ where: { userId: user.id } });
      const { rawToken, expiresAt } = await createSession(ctx.db, user.id, membership?.orgId ?? null);
      setSessionCookie(ctx.res, rawToken, expiresAt);

      return { id: user.id, email: user.email, name: user.name };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionId) {
      await deleteSession(ctx.db, ctx.sessionId);
    }
    clearSessionCookie(ctx.res);
    return { ok: true };
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return null;
    const user = await ctx.db.user.findUnique({ where: { id: ctx.userId } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      scopes: ctx.scopes,
      currentOrgId: ctx.currentOrgId,
    };
  }),

  myOrgs: scopedProcedure([]).query(async ({ ctx }) => {
    const memberships = await ctx.db.organizationMember.findMany({
      where: { userId: ctx.userId as string },
      include: { org: { select: { id: true, name: true } } },
    });
    return memberships.map((m) => m.org);
  }),

  switchOrg: scopedProcedure([])
    .input(z.object({ orgId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(async (tx) => {
        const membership = await tx.organizationMember.findUnique({
          where: { orgId_userId: { orgId: input.orgId, userId: ctx.userId as string } },
        });
        if (!membership) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization" });
        }
        await tx.session.update({
          where: { id: ctx.sessionId as string },
          data: { activeOrgId: input.orgId },
        });
      });
      return { ok: true };
    }),

  updateProfile: scopedProcedure([])
    .meta({ description: "Update the current user's own name and profile picture" })
    .input(z.object({
      name: z.string().min(1).optional(),
      picture: z.string().url().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.userId as string },
        data: input,
      });
      return { id: user.id, email: user.email, name: user.name, picture: user.picture };
    }),

  changePassword: scopedProcedure([])
    .meta({ description: "Change the current user's own password" })
    .input(z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const credential = await ctx.db.credential.findUnique({ where: { userId: ctx.userId as string } });
      const valid = credential && (await verifyPassword(credential.passwordHash, input.currentPassword));
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      }

      const passwordHash = await hashPassword(input.newPassword);
      await ctx.db.credential.update({
        where: { userId: ctx.userId as string },
        data: { passwordHash },
      });
      return { ok: true };
    }),
});
