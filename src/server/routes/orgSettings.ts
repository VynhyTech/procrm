import { randomBytes } from "crypto";
import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { requireActiveOrg } from "../lib/auditHelper";
import { hashToken } from "../lib/session";
import { seedCrmRolesForOrg } from "../lib/seedCrmRoles";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const orgSettingsRouter = router({
  getBusinessUnits: scopedProcedure([])
    .meta({ description: "Get business units for the current organization" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      return ctx.db.businessUnit.findMany({
        where: { orgId: orgId },
        include: { _count: { select: { teams: true } } },
        orderBy: { createdAt: "asc" },
      });
    }),

  createBusinessUnit: scopedProcedure(["businessUnits:manage"])
    .meta({ description: "Create a new business unit" })
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      return ctx.db.businessUnit.create({
        data: {
          orgId: orgId,
          name: input.name,
          description: input.description || null,
        },
      });
    }),

  updateBusinessUnit: scopedProcedure(["businessUnits:manage"])
    .meta({ description: "Update a business unit" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      status: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.businessUnit.update({ where: { id }, data });
    }),

  // ====== Custom Fields ======
  getCustomFields: scopedProcedure([])
    .meta({ description: "Get custom field definitions, optionally filtered by entity type" })
    .input(z.object({ entityType: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const where: Record<string, unknown> = { orgId };
      if (input?.entityType) where.entityType = input.entityType;
      const fields = await ctx.db.customFieldDefinition.findMany({
        where,
        orderBy: [{ entityType: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      });
      return fields.map((f) => ({ ...f, options: f.options as string[] | null }));
    }),

  createCustomField: scopedProcedure(["customFields:manage"])
    .meta({ description: "Create a custom field definition" })
    .input(z.object({
      entityType: z.enum(["Lead", "Contact", "Opportunity"]),
      label: z.string().min(1),
      fieldType: z.enum(["text", "number", "date", "select", "checkbox"]),
      options: z.array(z.string()).optional(),
      required: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      if (input.fieldType === "select" && (!input.options || input.options.filter((o) => o.trim()).length === 0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dropdown fields need at least one option" });
      }

      const baseKey = input.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
      let key = baseKey;
      let suffix = 1;
      while (await ctx.db.customFieldDefinition.findFirst({ where: { orgId, entityType: input.entityType, key } })) {
        suffix++;
        key = `${baseKey}_${suffix}`;
      }

      const maxSort = await ctx.db.customFieldDefinition.aggregate({
        where: { orgId, entityType: input.entityType },
        _max: { sortOrder: true },
      });

      return ctx.db.customFieldDefinition.create({
        data: {
          orgId,
          entityType: input.entityType,
          key,
          label: input.label.trim(),
          fieldType: input.fieldType,
          options: input.fieldType === "select" ? input.options?.filter((o) => o.trim()) : undefined,
          required: input.required,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          createdBy: ctx.userId,
        },
      });
    }),

  updateCustomField: scopedProcedure(["customFields:manage"])
    .meta({ description: "Update a custom field definition" })
    .input(z.object({
      id: z.string(),
      label: z.string().min(1).optional(),
      options: z.array(z.string()).optional(),
      required: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.customFieldDefinition.update({ where: { id }, data });
    }),

  deleteCustomField: scopedProcedure(["customFields:manage"])
    .meta({ description: "Delete a custom field definition" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.customFieldDefinition.delete({ where: { id: input.id } });
      return { success: true };
    }),

  getTeams: scopedProcedure([])
    .meta({ description: "Get teams, optionally filtered by business unit" })
    .input(z.object({ businessUnitId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";

      const where: Record<string, unknown> = { orgId: orgId };
      if (input?.businessUnitId) where.businessUnitId = input.businessUnitId;

      return ctx.db.team.findMany({
        where,
        include: {
          businessUnit: { select: { id: true, name: true } },
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  createTeam: scopedProcedure(["teams:manage"])
    .meta({ description: "Create a new team" })
    .input(z.object({
      businessUnitId: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      const bu = await ctx.db.businessUnit.findUnique({ where: { id: input.businessUnitId } });
      if (!bu || bu.orgId !== orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid business unit" });
      }

      return ctx.db.team.create({
        data: {
          orgId: orgId,
          businessUnitId: input.businessUnitId,
          name: input.name,
          description: input.description || null,
        },
      });
    }),

  updateTeam: scopedProcedure(["teams:manage"])
    .meta({ description: "Update a team" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.team.update({ where: { id }, data });
    }),

  getTeamMembers: scopedProcedure([])
    .meta({ description: "Get members of a team" })
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.teamMember.findMany({
        where: { teamId: input.teamId },
        include: { user: { select: { id: true, name: true, email: true, picture: true } } },
        orderBy: { assignedAt: "asc" },
      });
    }),

  addTeamMember: scopedProcedure(["teams:manage"])
    .meta({ description: "Add a user to a team" })
    .input(z.object({ teamId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.teamMember.create({
        data: { teamId: input.teamId, userId: input.userId },
      });
    }),

  removeTeamMember: scopedProcedure(["teams:manage"])
    .meta({ description: "Remove a user from a team" })
    .input(z.object({ teamId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.teamMember.delete({
        where: { userId_teamId: { userId: input.userId, teamId: input.teamId } },
      });
      return { success: true };
    }),

  getOrgMembers: scopedProcedure([])
    .meta({ description: "Get all members of the current organization" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      const members = await ctx.db.organizationMember.findMany({
        where: { orgId: orgId },
        include: { user: { select: { id: true, name: true, email: true, picture: true } } },
      });

      return members.map((m) => m.user);
    }),

  inviteMember: scopedProcedure(["orgs:manageOrgMembers"])
    .meta({ description: "Invite a user (existing or new) to the current organization" })
    .input(z.object({ email: z.string().email(), roleId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Derived from ctx, never from client input — an admin can only invite into the org
      // they're currently acting in, not an arbitrary org they happen to have a role on.
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const email = input.email.trim().toLowerCase();

      const roleId =
        input.roleId ?? (await ctx.db.role.findFirst({ where: { orgId, isDefault: true }, select: { id: true } }))?.id;

      const existing = await ctx.db.user.findFirst({ where: { email }, include: { credential: true } });

      if (existing) {
        const alreadyMember = await ctx.db.organizationMember.findUnique({
          where: { orgId_userId: { orgId, userId: existing.id } },
        });
        if (alreadyMember) {
          throw new TRPCError({ code: "CONFLICT", message: "Already a member of this organization" });
        }
      }

      if (existing?.credential) {
        // Real account already exists — add membership directly, no invite token needed.
        await ctx.db.$transaction([
          ctx.db.organizationMember.create({ data: { orgId, userId: existing.id } }),
          ...(roleId ? [ctx.db.userRole.create({ data: { userId: existing.id, roleId } })] : []),
        ]);
        return { status: "added" as const };
      }

      // No account yet, or a still-pending invite from before — (re)issue a claim token.
      const rawToken = randomBytes(32).toString("base64url");
      const inviteTokenHash = hashToken(rawToken);
      const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

      const user = existing
        ? await ctx.db.user.update({
            where: { id: existing.id },
            data: { inviteTokenHash, inviteTokenExpiresAt },
          })
        : await ctx.db.user.create({
            data: { email, isExplicitInvite: true, inviteTokenHash, inviteTokenExpiresAt },
          });

      await ctx.db.$transaction([
        ctx.db.organizationMember.create({ data: { orgId, userId: user.id } }),
        ...(roleId ? [ctx.db.userRole.create({ data: { userId: user.id, roleId } })] : []),
      ]);

      return {
        status: "invited" as const,
        claimUrl: `/signup?email=${encodeURIComponent(email)}&inviteToken=${rawToken}`,
      };
    }),

  seedCrmRoles: scopedProcedure(["roles:edit"])
    .meta({ description: "Seed the default CRM roles (Tenant Admin, Sales Manager, Agent, Viewer) for the current organization" })
    .mutation(async ({ ctx }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const roles = await seedCrmRolesForOrg(ctx.db, orgId);
      return { created: roles.map((r) => r.name) };
    }),

  // ====== Role Management ======
  listRoles: scopedProcedure(["roles:view"])
    .meta({ description: "List all roles for the current org" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId;
      return ctx.db.role.findMany({
        where: { OR: [{ orgId: orgId }, { orgId: null }] },
        include: { scopes: { include: { scope: true } }, _count: { select: { users: true } } },
        orderBy: { name: "asc" },
      });
    }),

  listScopes: scopedProcedure(["roles:view"])
    .meta({ description: "List available scopes — filtered to tenant-allowed scopes for customer admins" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId;
      const isPlatformAdmin = ctx.jwtScopes?.includes("tenants:manage");

      // Platform admins see all scopes
      if (isPlatformAdmin) {
        return ctx.db.scope.findMany({ orderBy: { name: "asc" } });
      }

      // Customer admins: check if their org has allowed scopes configured
      if (orgId) {
        const allowedCount = await ctx.db.tenantAllowedScope.count({ where: { orgId } });
        if (allowedCount > 0) {
          // Only show scopes that the platform admin has allowed for this org
          return ctx.db.scope.findMany({
            where: {
              tenantAllowedScopes: { some: { orgId } },
            },
            orderBy: { name: "asc" },
          });
        }
      }

      // Fallback: no allowed scopes configured yet — show all org-assignable scopes
      return ctx.db.scope.findMany({
        where: { orgAssignable: true },
        orderBy: { name: "asc" },
      });
    }),

  createRole: scopedProcedure(["roles:edit"])
    .meta({ description: "Create a new role" })
    .input(z.object({ name: z.string().min(1), description: z.string().optional(), scopeIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const role = await ctx.db.role.create({
        data: {
          name: input.name,
          description: input.description || null,
          orgId,
          scopes: { create: input.scopeIds.map((scopeId) => ({ scopeId })) },
        },
      });
      return role;
    }),

  updateRole: scopedProcedure(["roles:edit"])
    .meta({ description: "Update a role name/description" })
    .input(z.object({ id: z.string(), name: z.string().min(1).optional(), description: z.string().optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.role.update({ where: { id }, data });
    }),

  setRoleScopes: scopedProcedure(["roles:edit"])
    .meta({ description: "Set the scopes for a role (replaces all existing scopes)" })
    .input(z.object({ roleId: z.string(), scopeIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      // Delete existing scopes
      await ctx.db.roleScope.deleteMany({ where: { roleId: input.roleId } });
      // Add new scopes
      if (input.scopeIds.length > 0) {
        await ctx.db.roleScope.createMany({
          data: input.scopeIds.map((scopeId) => ({ roleId: input.roleId, scopeId })),
        });
      }
      return { success: true };
    }),

  deleteRole: scopedProcedure(["roles:edit"])
    .meta({ description: "Delete a role" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = await ctx.db.role.findUnique({ where: { id: input.id } });
      if (role?.isSystem) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete a system role" });
      await ctx.db.roleScope.deleteMany({ where: { roleId: input.id } });
      await ctx.db.userRole.deleteMany({ where: { roleId: input.id } });
      await ctx.db.role.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ====== User Role Assignment ======
  listUserRoles: scopedProcedure(["users:viewRoles"])
    .meta({ description: "List users with their roles" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";
      const members = await ctx.db.organizationMember.findMany({
        where: { orgId },
        include: {
          user: {
            select: {
              id: true, name: true, email: true, picture: true, isExplicitInvite: true,
              credential: { select: { id: true } },
              roles: { include: { role: true } },
            },
          },
        },
      });
      return members.map((m) => ({
        id: m.user.id, name: m.user.name, email: m.user.email, picture: m.user.picture,
        status: (m.user.isExplicitInvite && !m.user.credential ? "pending" : "active") as "pending" | "active",
        roles: m.user.roles.map((r) => r.role),
      }));
    }),

  resendInvite: scopedProcedure(["orgs:manageOrgMembers"])
    .meta({ description: "Regenerate a claim link for a pending, unclaimed invited user" })
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const member = await ctx.db.organizationMember.findUnique({ where: { orgId_userId: { orgId, userId: input.userId } } });
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "User is not a member of this organization" });

      const user = await ctx.db.user.findUnique({ where: { id: input.userId }, include: { credential: true } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (user.credential) throw new TRPCError({ code: "BAD_REQUEST", message: "User has already claimed their account" });

      const rawToken = randomBytes(32).toString("base64url");
      const inviteTokenHash = hashToken(rawToken);
      const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
      await ctx.db.user.update({ where: { id: user.id }, data: { inviteTokenHash, inviteTokenExpiresAt } });

      return { claimUrl: `/signup?email=${encodeURIComponent(user.email ?? "")}&inviteToken=${rawToken}` };
    }),

  assignRoleToUser: scopedProcedure(["users:editRoles"])
    .meta({ description: "Assign a role to a user" })
    .input(z.object({ userId: z.string(), roleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.userRole.upsert({
        where: { userId_roleId: { userId: input.userId, roleId: input.roleId } },
        update: {},
        create: { userId: input.userId, roleId: input.roleId },
      });
      return { success: true };
    }),

  removeRoleFromUser: scopedProcedure(["users:editRoles"])
    .meta({ description: "Remove a role from a user" })
    .input(z.object({ userId: z.string(), roleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.userRole.deleteMany({ where: { userId: input.userId, roleId: input.roleId } });
      return { success: true };
    }),
});
