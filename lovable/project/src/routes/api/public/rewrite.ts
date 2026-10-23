import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/rewrite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createRewriteHandler } = await import("@/server/rewrite-handler.server");
        return createRewriteHandler({
          url: process.env["SUPABASE_URL"] ?? "",
          publishableKey:
            process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "",
          aiKey: process.env["OPENAI_API_KEY"],
          model: process.env["OPENAI_MODEL"],
        })(request);
      },
      OPTIONS: async ({ request }) =>
        (await import("@/server/rewrite-handler.server")).createRewriteHandler({
          url: "",
          publishableKey: "",
        })(request),
      GET: async ({ request }) =>
        (await import("@/server/rewrite-handler.server")).createRewriteHandler({
          url: "",
          publishableKey: "",
        })(request),
    },
  },
});
