import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/engine-api')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { createEngineHandler } = await import('@/server/engine-handler.server');
        return createEngineHandler(supabaseAdmin)(request);
      },
      GET: async () => Response.json({ error: 'Método inválido' }, { status: 405, headers: { 'Cache-Control': 'no-store' } }),
    },
  },
});
