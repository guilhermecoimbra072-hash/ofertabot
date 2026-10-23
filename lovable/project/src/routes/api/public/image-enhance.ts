import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/image-enhance')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createImageEnhanceHandler } = await import('@/server/image-enhance-handler.server');
        return createImageEnhanceHandler({ url: process.env['SUPABASE_URL'] ?? '', publishableKey: process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY'] ?? '', serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'], ai: { model: process.env['AI_IMAGE_MODEL'], lovableKey: process.env['LOVABLE_API_KEY'] } })(request);
      },
      OPTIONS: async ({ request }) => (await import('@/server/image-enhance-handler.server')).createImageEnhanceHandler({ url: '', publishableKey: '' })(request),
      GET: async ({ request }) => (await import('@/server/image-enhance-handler.server')).createImageEnhanceHandler({ url: '', publishableKey: '' })(request),
    },
  },
});
