# Backend do OfertaBot: compatibilidade antes da aplicação

## Conferência concluída
- A consulta ao banco deste OfertaBot retornou **zero tabelas nos schemas `public` e `private`**.
- O cliente gerado já usa a URL e a chave publicável configuradas pelo Lovable Cloud; não precisa ser substituído.
- Nenhuma migração aplicada, função publicada, credencial alterada ou serviço contratado nesta conferência.

## Impedimentos à aplicação literal
1. Esta stack TanStack utiliza endpoints HTTP do próprio aplicativo para novas APIs, não novas Edge Functions. Portanto, não é possível publicar literalmente os arquivos Deno `engine-api` e `rewrite` aqui.
2. O Lovable Cloud não permite a referência direta de `public.members.user_id` a `auth.users`. A exceção permitida é para `profiles` e `user_roles`, mas não criaremos nem renomearemos tabelas do seu contrato.
3. `supabase/config.toml` é gerenciado pela plataforma e não pode ser substituído por `project_id = "ofertabot"`.

## Adaptação proposta — depende de aprovação
- Preservar os nomes `companies`, `members`, `connections`, `groups`, `offers`, `offer_revisions`, `publications`, `audit`, `templates` e as tabelas privadas fornecidas.
- Manter `members.user_id` como UUID sem a referência direta proibida. Preservar a limpeza de vínculos ao excluir uma conta usando uma função em `public` e um gatilho autorizado do ciclo de autenticação. Essa é uma diferença estrutural em relação ao arquivo original.
- Preservar as regras SQL fornecidas e ajustar somente a ordem das concessões de acesso para cumprir os requisitos da plataforma.
- Adaptar as duas funções para `/api/public/engine-api` e `/api/public/rewrite`, mantendo a validação interna de credenciais e a lógica fornecida. As URLs e o formato de implantação serão diferentes; não haverá configuração `verify_jwt` de Edge Functions.
- Não adicionar `OPENAI_API_KEY`, não chamar o provedor pago e manter a resposta de IA não configurada enquanto não houver credencial.
- Não modificar o frontend nem criar dados de demonstração.

## Verificação após aprovação
- Gerar `supabase/schema.sql` e uma migração correspondente; aplicar exclusivamente neste banco pelo mecanismo de migrações do Lovable Cloud.
- Confirmar tabelas, constraints, concessões, RLS, funções e bucket privado.
- Criar testes das regras do contrato e executar os cenários pertinentes sem manter dados de teste no banco real.
- Verificar os endpoints com credenciais inválidas e, quando possível, com uma sessão autenticada real.
- Relatar resultados, diferenças, arquivos e qualquer verificação pendente. A implantação pública dos endpoints depende da publicação do aplicativo.

## Decisão solicitada
Autorizar essas adaptações mínimas ou manter a exigência de arquivos literais, caso em que a implantação está bloqueada nesta stack.
