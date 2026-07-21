import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { seedCrmRolesForOrg } from "../lib/seedCrmRoles";

export const onboardingRouter = router({
  // Check if current user needs onboarding (has no org)
  checkStatus: scopedProcedure([])
    .meta({ description: "Check if user needs onboarding" })
    .query(async ({ ctx }) => {
      const membership = await ctx.db.organizationMember.findFirst({
        where: { userId: ctx.userId },
        select: { orgId: true },
      });
      return { needsOnboarding: !membership, orgId: membership?.orgId ?? null };
    }),

  // Register a new organization and make the current user its admin
  register: scopedProcedure([])
    .meta({ description: "Register a new organization (self-service onboarding)" })
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().min(1),
      phone: z.string().optional(),
      companyName: z.string().min(1),
      industry: z.string().default("Real Estate"),
      companySize: z.string().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check user doesn't already belong to an org
      const existing = await ctx.db.organizationMember.findFirst({
        where: { userId: ctx.userId },
      });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You already belong to an organization" });
      }

      // Create org, membership, update user, and assign admin role in a transaction
      const result = await ctx.db.$transaction(async (tx) => {
        // Update user's name and email if provided
        await tx.user.update({
          where: { id: ctx.userId },
          data: {
            name: `${input.firstName} ${input.lastName}`,
            email: input.email,
          },
        });

        // Create the organization
        const org = await tx.organization.create({
          data: {
            name: input.companyName,
            email: input.email,
            phone: input.phone || null,
            industry: input.industry,
            companySize: input.companySize || null,
            country: input.country || null,
            city: input.city || null,
            status: "active",
            createdBy: ctx.userId,
          },
        });

        // Add user as member
        await tx.organizationMember.create({
          data: { orgId: org.id, userId: ctx.userId },
        });

        // Activate the new org on this session — mirrors auth.switchOrg's own update.
        // Without this, ctx.currentOrgId stays null and the Tenant Admin role granted
        // below never resolves into ctx.scopes (getEffectiveScopes filters org-scoped
        // roles by the session's active org, not just membership).
        await tx.session.update({
          where: { id: ctx.sessionId as string },
          data: { activeOrgId: org.id },
        });

        // Seed this org's default CRM roles and make the creator its "Tenant Admin" —
        // there is no pre-seeded global "Admin" role anywhere in this system, so the
        // owner's permissions have to be materialized here, in the same transaction as
        // the org itself, or they'd be locked out of their own new org (see phase-10b brief).
        const roles = await seedCrmRolesForOrg(tx, org.id);
        const ownerRole = roles.find((r) => r.name === "Tenant Admin");
        if (ownerRole) {
          await tx.userRole.create({
            data: { userId: ctx.userId, roleId: ownerRole.id },
          });
        }

        return org;
      });

      return { orgId: result.id, orgName: result.name };
    }),

  // Get branding for the current org
  getBranding: scopedProcedure([])
    .meta({ description: "Get branding settings for the current organization" })
    .query(async ({ ctx }) => {
      if (!ctx.currentOrgId) return null;
      const org = await ctx.db.organization.findUnique({
        where: { id: ctx.currentOrgId },
        select: { name: true, logoUrl: true, primaryColor: true },
      });
      return org;
    }),

  // Update branding
  updateBranding: scopedProcedure(["businessUnits:manage"])
    .meta({ description: "Update organization branding (logo and color)" })
    .input(z.object({
      logoUrl: z.string().optional().nullable(),
      primaryColor: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.currentOrgId) throw new TRPCError({ code: "BAD_REQUEST", message: "No organization selected" });
      return ctx.db.organization.update({
        where: { id: ctx.currentOrgId },
        data: input,
      });
    }),
});
