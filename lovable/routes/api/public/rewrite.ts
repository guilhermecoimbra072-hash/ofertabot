import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/rewrite')({server:{handlers:{POST:async({request})=>{
 const {createRewriteHandler}=await import('@/server/rewrite-handler.server');
 const lovableKey=process.env.LOVABLE_API_KEY;const openAIKey=process.env.OPENAI_API_KEY;
 return createRewriteHandler({url:process.env.SUPABASE_URL!,publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY!,aiKey:lovableKey||openAIKey,endpoint:lovableKey?'https://ai.gateway.lovable.dev/v1/chat/completions':'https://api.openai.com/v1/chat/completions',model:process.env.AI_MODEL||(lovableKey?'google/gemini-2.5-flash':process.env.OPENAI_MODEL)})(request);
}}});
