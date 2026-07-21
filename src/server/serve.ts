import "dotenv/config";
import path from "path";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";

import { API_BASE } from "../constants";
import { appRouter } from "./router";
import { createContext } from "./trpc";
import { prisma } from "./db";
import { seedScopes } from "./lib/seedScopes";
import { registerLeadIntakeWebhook } from "./webhooks/leadIntake";

// maxParamLength above find-my-way's default of 100 — tRPC's batch route packs every
// batched procedure name into one path parameter, and real pages (e.g. Lead Detail)
// already cross 100 chars once a handful of moderately-named procedures batch together.
const server = Fastify({ logger: true, maxParamLength: 500 });

async function main() {
  const scopeCount = await seedScopes(prisma);
  server.log.info(`Seeded ${scopeCount} scopes`);

  await server.register(fastifyCookie);

  await server.register(fastifyTRPCPlugin, {
    prefix: API_BASE,
    trpcOptions: { router: appRouter, createContext },
  });

  registerLeadIntakeWebhook(server);

  // In dev, webpack-dev-server serves the frontend and proxies API_BASE here instead —
  // dist/web won't exist yet at that point, so only register static serving in production.
  if (process.env.NODE_ENV === "production") {
    const webDist = path.resolve(process.cwd(), "dist/web");
    await server.register(fastifyStatic, { root: webDist });
    server.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith(API_BASE)) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  const port = Number(process.env.PORT ?? 4000);
  await server.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  server.log.error(err);
  process.exit(1);
});
