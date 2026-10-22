// Copiar para src/routes/api/public/engine-api.ts no projeto TanStack Lovable.
import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/engine-api')({server:{handlers:{POST:async({request})=>{
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {createEngineHandler}=await import('@/server/engine-handler.server');
 return createEngineHandler(supabaseAdmin)(request);
}}});
