import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { requireActiveOrg } from "../lib/auditHelper";

export const internalChatRouter = router({
  // ===== Internal Comments (record-level) =====

  getComments: scopedProcedure([])
    .meta({ description: "Get internal comments for a CRM record" })
    .input(z.object({
      objectType: z.string(),
      objectId: z.string(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.internalComment.findMany({
        where: {
          relatedObjectType: input.objectType,
          relatedObjectId: input.objectId,
        },
        include: { author: { select: { id: true, name: true, email: true, picture: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  addComment: scopedProcedure([])
    .meta({ description: "Add an internal comment to a CRM record" })
    .input(z.object({
      objectType: z.string(),
      objectId: z.string(),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      return ctx.db.internalComment.create({
        data: {
          orgId: orgId,
          authorId: ctx.userId,
          relatedObjectType: input.objectType,
          relatedObjectId: input.objectId,
          content: input.content,
        },
        include: { author: { select: { id: true, name: true, email: true, picture: true } } },
      });
    }),

  deleteComment: scopedProcedure([])
    .meta({ description: "Delete an internal comment (own comments only)" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.internalComment.findUnique({ where: { id: input.id } });
      if (!comment) throw new TRPCError({ code: "NOT_FOUND" });
      if (comment.authorId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN", message: "Can only delete your own comments" });
      await ctx.db.internalComment.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ===== Team Chat Channels =====

  getChannels: scopedProcedure([])
    .meta({ description: "Get team chat channels the current user is a member of" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      return ctx.db.teamChatChannel.findMany({
        where: { orgId: orgId, members: { some: { userId: ctx.userId } } },
        include: { _count: { select: { messages: true, members: true } } },
        orderBy: { createdAt: "asc" },
      });
    }),

  createChannel: scopedProcedure([])
    .meta({ description: "Create a team chat channel" })
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      const channel = await ctx.db.teamChatChannel.create({
        data: { orgId: orgId, name: input.name, description: input.description || null },
      });
      await ctx.db.teamChatChannelMember.create({
        data: { channelId: channel.id, userId: ctx.userId },
      });
      return channel;
    }),

  getChannelMessages: scopedProcedure([])
    .meta({ description: "Get messages from a team chat channel" })
    .input(z.object({
      channelId: z.string(),
      limit: z.number().min(1).max(100).default(50),
      before: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await ctx.db.teamChatChannelMember.findUnique({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.userId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this channel" });

      const where: Record<string, unknown> = { channelId: input.channelId };
      if (input.before) {
        where.createdAt = { lt: new Date(input.before) };
      }

      return ctx.db.teamChatMessage.findMany({
        where,
        include: { author: { select: { id: true, name: true, email: true, picture: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  sendChannelMessage: scopedProcedure([])
    .meta({ description: "Send a message to a team chat channel" })
    .input(z.object({
      channelId: z.string(),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.teamChatChannelMember.findUnique({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.userId } },
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this channel" });

      return ctx.db.teamChatMessage.create({
        data: {
          channelId: input.channelId,
          authorId: ctx.userId,
          content: input.content,
        },
        include: { author: { select: { id: true, name: true, email: true, picture: true } } },
      });
    }),

  listChannelMembers: scopedProcedure([])
    .meta({ description: "List members of a team chat channel" })
    .input(z.object({ channelId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.teamChatChannelMember.findMany({
        where: { channelId: input.channelId },
        include: { user: { select: { id: true, name: true, email: true, picture: true } } },
        orderBy: { joinedAt: "asc" },
      });
    }),

  addChannelMember: scopedProcedure([])
    .meta({ description: "Add a person to a team chat channel" })
    .input(z.object({ channelId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.teamChatChannelMember.create({ data: input });
    }),

  removeChannelMember: scopedProcedure([])
    .meta({ description: "Remove a person from a team chat channel" })
    .input(z.object({ channelId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.teamChatChannelMember.delete({
        where: { channelId_userId: input },
      });
      return { success: true };
    }),

  leaveChannel: scopedProcedure([])
    .meta({ description: "Leave a team chat channel" })
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.teamChatChannelMember.delete({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.userId } },
      });
      return { success: true };
    }),
});
