import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/router";
import { API_BASE } from "../constants";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: API_BASE,
      // Keeps batched GET URLs under Fastify's router (find-my-way) default
      // maxParamLength of 100 chars on the comma-joined procedure-name segment —
      // past that it 414s and silently breaks every query in the batch, not just
      // the ones with long names. tRPC auto-splits into smaller batches instead.
      maxURLLength: 2000,
      // Required so the session cookie is actually sent — without this every request
      // is silently unauthenticated regardless of whether the user is logged in.
      fetch(url, opts) {
        return fetch(url, { ...opts, credentials: "include" });
      },
    }),
  ],
});
