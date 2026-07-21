import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db";
import { hashApiKey } from "../lib/apiKey";
import { createLeadCore } from "../routes/leads";

const payloadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  source: z.string().optional(),
  campaignName: z.string().optional(),
  externalLeadId: z.string().optional(),
  notes: z.string().optional(),
});

async function logRequest(params: {
  orgId: string | null;
  apiKeyId: string | null;
  source: string | null;
  externalLeadId: string | null;
  payload: unknown;
  status: number;
  leadId: string | null;
  error: string | null;
}) {
  try {
    await prisma.webhookRequestLog.create({
      data: {
        orgId: params.orgId,
        apiKeyId: params.apiKeyId,
        source: params.source,
        externalLeadId: params.externalLeadId,
        payload: JSON.stringify(params.payload),
        status: params.status,
        leadId: params.leadId,
        error: params.error,
      },
    });
  } catch {
    // Logging failures should never break the actual intake response.
  }
}

/**
 * External lead intake — the bridge for Zapier/Make "Facebook Lead Ads" (or LinkedIn, Google
 * Lead Form, etc.) automations to push a new lead in, tagged with a campaign name. A raw
 * Fastify route rather than a tRPC procedure: external callers authenticate with a static
 * `x-api-key` header, not a session cookie, and expect a plain REST request/response.
 */
export function registerLeadIntakeWebhook(server: FastifyInstance) {
  server.post("/api/v1/lead-intake", async (request, reply) => {
    const rawKey = request.headers["x-api-key"];
    if (typeof rawKey !== "string" || !rawKey) {
      await logRequest({ orgId: null, apiKeyId: null, source: null, externalLeadId: null, payload: request.body, status: 401, leadId: null, error: "Missing x-api-key header" });
      return reply.code(401).send({ error: "Missing x-api-key header" });
    }

    const apiKey = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(rawKey) } });
    if (!apiKey || apiKey.revokedAt) {
      await logRequest({ orgId: apiKey?.orgId ?? null, apiKeyId: apiKey?.id ?? null, source: null, externalLeadId: null, payload: request.body, status: 401, leadId: null, error: apiKey ? "API key revoked" : "Invalid API key" });
      return reply.code(401).send({ error: "Invalid or revoked API key" });
    }

    const parsed = payloadSchema.safeParse(request.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      await logRequest({ orgId: apiKey.orgId, apiKeyId: apiKey.id, source: null, externalLeadId: null, payload: request.body, status: 400, leadId: null, error: message });
      return reply.code(400).send({ error: message });
    }
    const input = parsed.data;

    if (!input.email && !input.phone) {
      await logRequest({ orgId: apiKey.orgId, apiKeyId: apiKey.id, source: input.source ?? null, externalLeadId: input.externalLeadId ?? null, payload: request.body, status: 400, leadId: null, error: "Email or phone is required" });
      return reply.code(400).send({ error: "Email or phone is required" });
    }

    // Idempotency: a retried delivery of the same platform lead id should not create a
    // second Lead — replay the original outcome instead.
    if (input.externalLeadId) {
      const previous = await prisma.webhookRequestLog.findFirst({
        where: { orgId: apiKey.orgId, externalLeadId: input.externalLeadId, status: { gte: 200, lt: 300 }, leadId: { not: null } },
        orderBy: { createdAt: "desc" },
      });
      if (previous?.leadId) {
        await logRequest({ orgId: apiKey.orgId, apiKeyId: apiKey.id, source: input.source ?? null, externalLeadId: input.externalLeadId, payload: request.body, status: 200, leadId: previous.leadId, error: "Duplicate delivery — returned original result" });
        return reply.code(200).send({ leadId: previous.leadId, duplicate: true });
      }
    }

    let campaignId: string | null = null;
    if (input.campaignName) {
      const existing = await prisma.campaign.findFirst({ where: { orgId: apiKey.orgId, name: input.campaignName } });
      campaignId = existing
        ? existing.id
        : (await prisma.campaign.create({ data: { orgId: apiKey.orgId, name: input.campaignName, type: input.source || null, createdBy: apiKey.createdBy } })).id;
    }

    try {
      const result = await createLeadCore(prisma, apiKey.orgId, apiKey.createdBy ?? "", {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
        source: input.source || "Webhook",
        intakeMode: "webhook",
        campaignName: input.campaignName,
        trustedCampaignId: campaignId,
      });

      await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });

      const leadId = "id" in result ? result.id : null;
      await logRequest({ orgId: apiKey.orgId, apiKeyId: apiKey.id, source: input.source ?? null, externalLeadId: input.externalLeadId ?? null, payload: request.body, status: 200, leadId, error: null });
      return reply.code(200).send({ leadId, type: result.type });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create lead";
      await logRequest({ orgId: apiKey.orgId, apiKeyId: apiKey.id, source: input.source ?? null, externalLeadId: input.externalLeadId ?? null, payload: request.body, status: 400, leadId: null, error: message });
      return reply.code(400).send({ error: message });
    }
  });
}
