import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { requireActiveOrg } from "../lib/auditHelper";

export const attachmentsRouter = router({
  list: scopedProcedure([])
    .meta({ description: "List attachments for a record" })
    .input(z.object({ parentType: z.string(), parentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.attachment.findMany({
        where: { parentType: input.parentType, parentId: input.parentId },
        select: { id: true, fileName: true, fileSize: true, mimeType: true, uploadedBy: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
    }),

  upload: scopedProcedure([])
    .meta({ description: "Upload a file attachment to a record" })
    .input(z.object({
      parentType: z.string(),
      parentId: z.string(),
      fileName: z.string().min(1),
      fileSize: z.number(),
      mimeType: z.string(),
      fileData: z.string(), // base64
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      if (input.fileSize > 25 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File size must be under 25MB" });
      }
      return ctx.db.attachment.create({
        data: {
          orgId,
          parentType: input.parentType,
          parentId: input.parentId,
          fileName: input.fileName,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          fileData: input.fileData,
          uploadedBy: ctx.userId,
        },
      });
    }),

  download: scopedProcedure([])
    .meta({ description: "Download a file attachment" })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const attachment = await ctx.db.attachment.findUnique({ where: { id: input.id } });
      if (!attachment) throw new TRPCError({ code: "NOT_FOUND" });
      return attachment;
    }),

  delete: scopedProcedure([])
    .meta({ description: "Delete a file attachment" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.attachment.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
