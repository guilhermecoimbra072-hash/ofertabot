import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/rewrite')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createRewriteHandler } = await import('@/server/rewrite-handler.server');
        return createRewriteHandler({ url: process.env['SUPABASE_URL'] ?? '', publishableKey: process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY'] ?? '', serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'], ai: { provider: process.env['AI_PROVIDER'], baseUrl: process.env['AI_BASE_URL'], apiKey: process.env['AI_API_KEY'], model: process.env['AI_MODEL'], lovableKey: process.env['LOVABLE_API_KEY'] } })(request);
      },
      OPTIONS: async ({ request }) => (await import('@/server/rewrite-handler.server')).createRewriteHandler({ url: '', publishableKey: '' })(request),
      GET: async ({ request }) => (await import('@/server/rewrite-handler.server')).createRewriteHandler({ url: '', publishableKey: '' })(request),
    },
  },
});
