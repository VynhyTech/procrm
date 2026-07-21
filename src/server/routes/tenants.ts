import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const tenantsRouter = router({
  list: scopedProcedure(["tenants:manage"])
    .meta({ description: "List all tenants (Platform Admin)" })
    .query(async ({ ctx }) => {
      const orgs = await ctx.db.organization.findMany({
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: "desc" },
      });
      return orgs;
    }),

  getById: scopedProcedure(["tenants:manage"])
    .meta({ description: "Get tenant details by ID" })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findUnique({
        where: { id: input.id },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true, name: true, email: true, picture: true, lastSeenAt: true,
                  roles: { include: { role: { select: { id: true, name: true } } } },
                },
              },
            },
            orderBy: { assignedAt: "asc" },
          },
          allowedScopes: { include: { scope: { select: { id: true, name: true } } } },
          _count: {
            select: { leads: true, contacts: true, opportunities: true, businessUnits: true, crmTasks: true, crmActivities: true },
          },
        },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

      // Resolve createdBy user
      let createdByUser: { id: string; name: string | null; email: string | null; picture: string | null } | null = null;
      if (org.createdBy) {
        createdByUser = await ctx.db.user.findUnique({
          where: { id: org.createdBy },
          select: { id: true, name: true, email: true, picture: true },
        });
      }

      return { ...org, createdByUser };
    }),

  getCustomFields: scopedProcedure(["tenants:manage"])
    .meta({ description: "Get a tenant's custom field definitions (read-only, Platform Admin)" })
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      const fields = await ctx.db.customFieldDefinition.findMany({
        where: { orgId: input.orgId },
        orderBy: [{ entityType: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      });
      return fields.map((f) => ({ ...f, options: f.options as string[] | null }));
    }),

  create: scopedProcedure(["tenants:manage"])
    .meta({ description: "Create a new tenant" })
    .input(z.object({
      name: z.string().min(1),
      legalName: z.string().optional(),
      industry: z.string().optional(),
      companySize: z.string().optional(),
      website: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      streetAddress: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
      subscriptionPlan: z.string().default("standard"),
      maxUsers: z.number().optional(),
      billingEmail: z.string().optional(),
      taxId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.organization.create({
        data: { ...input, status: "active", createdBy: ctx.userId },
      });
    }),

  update: scopedProcedure(["tenants:manage"])
    .meta({ description: "Update a tenant" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      legalName: z.string().optional().nullable(),
      industry: z.string().optional().nullable(),
      companySize: z.string().optional().nullable(),
      website: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      streetAddress: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      postalCode: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
      subscriptionPlan: z.string().optional(),
      status: z.string().optional(),
      maxUsers: z.number().optional().nullable(),
      billingEmail: z.string().optional().nullable(),
      taxId: z.string().optional().nullable(),
      externalId: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.organization.update({ where: { id }, data });
    }),

  suspend: scopedProcedure(["tenants:manage"])
    .meta({ description: "Suspend a tenant" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.organization.update({
        where: { id: input.id },
        data: { status: "suspended" },
      });
    }),

  // ====== Tenant Allowed Scopes ======

  getAllScopes: scopedProcedure(["tenants:manage"])
    .meta({ description: "Get all org-assignable scopes (master list for platform admin)" })
    .query(async ({ ctx }) => {
      return ctx.db.scope.findMany({
        where: { orgAssignable: true },
        orderBy: { name: "asc" },
      });
    }),

  getTenantScopes: scopedProcedure(["tenants:manage"])
    .meta({ description: "Get the allowed scope IDs for a tenant" })
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      const allowed = await ctx.db.tenantAllowedScope.findMany({
        where: { orgId: input.orgId },
        select: { scopeId: true },
      });
      return allowed.map((a) => a.scopeId);
    }),

  setTenantScopes: scopedProcedure(["tenants:manage"])
    .meta({ description: "Set the allowed scopes for a tenant (replaces all)" })
    .input(z.object({ orgId: z.string(), scopeIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      // Verify org exists
      const org = await ctx.db.organization.findUnique({ where: { id: input.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

      // Replace all allowed scopes in a transaction
      await ctx.db.$transaction([
        ctx.db.tenantAllowedScope.deleteMany({ where: { orgId: input.orgId } }),
        ctx.db.tenantAllowedScope.createMany({
          data: input.scopeIds.map((scopeId) => ({ orgId: input.orgId, scopeId })),
        }),
      ]);

      return { success: true, count: input.scopeIds.length };
    }),
});
