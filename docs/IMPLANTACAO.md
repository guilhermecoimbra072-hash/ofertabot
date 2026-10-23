# Implantação e compatibilidade Lovable

## Projeto identificado

Lovable: https://lovable.dev/projects/6b91e5a7-7773-40fe-95df-8db9622278c5, workspace do proprietário. Criado exclusivamente para OfertaBot, sem alterar os outros 29 projetos encontrados. Backend aplicado e site publicado em https://ofertabot-central.lovable.app. O esquema inicial e a revisão de segurança constam do journal de migrações Drizzle da plataforma. Veja a evidência atual em `ENTREGA.md`.

A stack gerada é TanStack Start com React. Ela usa rotas HTTP próprias para novas APIs, não novas Edge Functions. Por isso a entrega inclui adaptação específica e o pacote portável Supabase; ambos compartilham as mesmas regras e usam **um único banco escolhido na implantação**.

## Lovable (implantação atual)

As etapas de backend, incorporação do painel e publicação abaixo já foram realizadas. São referência para manutenção e reconstrução, não uma lista para você repetir no primeiro teste. Use o painel publicado e emita sua credencial.

1. Aplicar `lovable/backend/schema.sql` como migração pelo mecanismo do Lovable Cloud. Não reaplicar o esquema completo sobre tabelas existentes; em evolução, gerar migrações incrementais.
2. Essa variante usa `members.user_id uuid` e um gatilho de limpeza na exclusão de `auth.users`. A plataforma não permite FK direta de `members` para `auth.users`. As consultas e autorizações por membro continuam no backend.
3. Copiar `server/engine-handler.ts` para `src/server/engine-handler.server.ts` e `server/rewrite-handler.ts` para `src/server/rewrite-handler.server.ts`.
4. Copiar os dois adaptadores de `lovable/routes/api/public/` para o diretório equivalente do projeto. O cliente administrativo é carregado dinamicamente dentro do handler; nunca importar em código de navegador. Preservar `src/integrations/supabase/client.server.ts` gerado pelo Lovable.
5. Incorporar os componentes de `src/` local em `src/ofertabot/` do Lovable, mantendo TanStack e seu root. Renderizar o aplicativo em uma rota sem SSR (ou somente após montagem no cliente), pois o painel depende de sessão/Canvas/navegador. Não substituir a infraestrutura TanStack nem impor Next.js.
6. Em `api.ts` usar o cliente Supabase gerado pelo projeto (que também trata o preview), mantendo os nomes de RPC. Configurar `engineUrl` para `window.location.origin+'/api/public/engine-api'` e a reescrita para `/api/public/rewrite`. A URL do motor precisa ser a hospedagem publicada, não um preview que exija login do editor.
7. Instalar versões fixas das dependências de frontend presentes no pacote; não instalar Baileys no servidor do painel. O motor é um processo separado.
8. Configurar Site URL e redirecionamentos Auth para a hospedagem HTTPS final e `http://localhost:5173` para teste local. Confirmar cadastro, e-mail e recuperação reais após publicação. SMTP personalizado não foi contratado.
9. Publicar no Lovable; conferir endereço retornado e autenticação. Sem essa confirmação, não considerar implantado.
10. O usuário criou o repositório privado `guilhermecoimbra072-hash/ofertabot` para análise dos fontes. A importação não configura sincronização automática. Se futuramente conectar no editor em Settings → GitHub, preserve a organização do repositório e o histórico; não presuma que a raiz portável é o mesmo projeto TanStack hospedado.

A pausa antiga de proposta foi resolvida após a instrução para continuar. Não há liberação de plano pendente para usar a publicação atual. A integração positiva com conta, e-mail e WhatsApp ainda exige o teste do usuário; não foram criados usuários fictícios no banco de produção.

## Supabase independente (alternativa, não segundo banco)

Use apenas se escolher hospedar fora do Lovable Cloud ou se a implantação Lovable permanecer bloqueada. Não crie outra fonte de dados paralela para os mesmos usuários e ofertas.

1. Em um projeto Supabase exclusivo do OfertaBot, aplicar `supabase/schema.sql` uma vez. A migração inicial equivalente está em `supabase/migrations/20261022000000_ofertabot_core.sql`; use `db push` seguindo a CLI instalada. A migração foi testada localmente, não aplicada em um Supabase remoto independente.
2. Publicar `engine-api` e `rewrite` com `verify_jwt=false`, como `supabase/config.toml`. O gateway valida token revogável; reescrita valida JWT via `auth.getUser` e autorização de empresa antes de qualquer chamada externa.
3. Os segredos padrão `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` ficam no runtime das funções, nunca no navegador/motor.
4. Configurar as variáveis públicas do painel no `.env` e construir com `npm run build`. Publicar `dist/web` em hospedagem HTTPS com fallback para `index.html`.
5. IA opcional: definir `OPENAI_API_KEY` e opcionalmente `OPENAI_MODEL` no backend; padrão `gpt-4.1-mini`. Isso usa créditos da API do usuário. Nenhuma chave foi solicitada ou contratada na entrega.
6. Executar os testes e um ensaio real com grupos escolhidos pelo usuário.

`node scripts/sync-adapters.mjs` regenera adaptadores Deno e variante SQL Cloud a partir de `server/` e `supabase/schema.sql`, evitando duas implementações divergentes. O motor usa a URL selecionada no `.env` e não precisa mudar seu protocolo.
