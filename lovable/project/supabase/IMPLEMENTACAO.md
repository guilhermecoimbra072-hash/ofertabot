# OfertaBot — resultado da implantação do backend

## Revisão FINAL aplicada em 22/10/2026

- Estado inicial consultado: 11 tabelas existentes com RLS, zero empresas e zero contas; bucket privado correto. A aplicação foi incremental, não uma recriação.
- `drizzle/migrations/0001_ofertabot_final_backend_revision.sql` aplicada e confirmada no banco. Referência idêntica em `supabase/migrations/20261022013600_ofertabot_final_backend_revision.sql`.
- `supabase/schema.sql` e `lovable/backend/schema.sql` contêm o contrato completo revisado, com as adaptações Cloud autorizadas: grants após CREATE TABLE e bucket configurado pela API, sem SQL em tabelas gerenciadas.
- Grupos de conexão revogada não podem ser reativados nem usados como destino, inclusive com flags legadas ativas.
- `engine_call` revalida a credencial após adquirir os locks; lease inválida usa SQLSTATE `42501`.
- `capture_error` registra apenas `message_hash` limitado a 64 caracteres e `code=permanent_rejection`; conteúdo, imagens e identificador original não entram nesse evento.
- Trigger final `ofertabot_member_cleanup` utiliza `public.ofertabot_cleanup_member()`. O trigger anterior foi substituído; sua função foi mantida, marcada como obsoleta, para compatibilidade sem quebra.
- Handlers movidos para `src/server/engine-handler.server.ts` e `src/server/rewrite-handler.server.ts`, com fábricas injetáveis e tipos reais do banco. Rotas carregam dinamicamente a exportação administrativa `supabaseAdmin`, conferida no arquivo gerado existente; cliente e configuração gerenciados preservados.
- Zod permanece para validar envelopes, mídia, caminhos e dados de reescrita; não foi adotado `any` dos exemplos. CORS de rewrite aceita POST/OPTIONS; OPTIONS retorna 204. Configuração de rewrite é lida dentro do handler e o cliente público trata chaves opacas corretamente.
- Nenhum frontend recriado ou alterado. Metadados individuais das oito páginas conferidos e preservados.

### Resultados desta revisão

- **27 testes passaram**: 19 regras PGlite, 6 handlers, 1 migração preservando empresa existente e comparando corpos finais de funções, 1 navegação. Arquivos: `src/test/backend-rules.test.ts`, `src/test/server-handlers.test.ts`, `src/test/backend-migration.test.ts`, `src/test/app-routing.test.tsx`.
- A revalidação após lock foi exercitada por injeção de falha isolada na segunda validação: a ação é rejeitada com `42501` e não altera o estado. Isso não substitui um teste simultâneo contra PostgreSQL hospedado.
- Banco hospedado confirmou as quatro alterações finais; 11 tabelas continuam com RLS. `anon` não executa snapshot; usuário autenticado não executa engine, não atribui plano e não insere ofertas diretamente; administrador do servidor executa engine.
- Storage conserva somente SELECT/INSERT autorizados ao cliente, bucket privado, 10.485.760 bytes e PNG/JPEG/WebP; nenhum UPDATE/DELETE de mídia concedido por policy.
- APIs reais locais: engine GET 405, POST sem token 401, token inexistente com formato válido 403; rewrite sem sessão ou sessão inválida 401; OPTIONS 204. Painel `Dashboard — OfertaBot` abre sem erros de execução.
- Rewrite autenticado sem IA retorna 503 no teste isolado; nenhum provedor pago foi configurado ou chamado.
- A compilação/tipagem automática inicialmente detectou imports antigos durante a movimentação e opcionais incompatíveis com `exactOptionalPropertyTypes`; corrigidos. Verificação posterior: **build OK**.

### Limites explícitos

- Auth real temporária **não exercitada**: nenhuma conta existe e o mecanismo interno de criação exige aprovação adicional e deixa a conta persistente. Não se criou conta nem endpoint administrativo para contornar isso; não há contas de teste a limpar. Configurações hospedadas de cadastro/provedores não foram verificadas ou alteradas.
- Fluxo autenticado pela interface permanece pendente do frontend fornecido pelo usuário. Os testes de sessão/RPC não certificam essa interface.
- Não foram repetidos os testes simultâneos PostgreSQL citados pelo usuário; os testes adicionados são isolados PGlite/handlers.
- Não houve vínculo WhatsApp, captura real, transporte, envio de mensagem, compra, alteração de secret ou publicação do aplicativo.
- A URL interna do banco não é divulgada no Lovable Cloud. A chave **publicável** configurada é `sb_publishable_fuzzyhbQPge3FA1WHJAqUQ_ZnEsC393`; nenhuma chave administrativa é divulgada.

O restante deste documento registra a aplicação anterior; resultados e caminhos atuais estão nesta seção.

## Aplicação verificada

- Antes da aplicação: nenhuma tabela em `public` ou `private`.
- Migração aplicada exclusivamente ao banco conectado deste OfertaBot.
- Nove tabelas públicas e duas privadas criadas, todas com RLS habilitada.
- Funções `app_snapshot`, `app_action`, `engine_context`, `engine_call`, `ai_authorize`, `admin_set_plan` criadas com `SECURITY DEFINER` e `search_path` vazio.
- Verificação de permissões: `anon` não executa snapshot; `authenticated` não executa engine nem atribui planos; `service_role` executa engine.
- Bucket `offer-media` privado, limite exato de 10.485.760 bytes e apenas PNG/JPEG/WebP; políticas de leitura/inserção preservadas, sem UPDATE/DELETE para o cliente.
- Zero empresas e zero contas de autenticação no banco na verificação final; nenhum dado de demonstração inserido.
- Cliente gerado preservado, usando a URL e a chave publicável configuradas pelo Lovable Cloud. Nenhuma credencial privada registrada em logs.
- `OPENAI_API_KEY` ausente; nenhum serviço comprado, nenhum provedor pago configurado ou chamado.

## Endpoints verificados no aplicativo local

| Endpoint | Solicitação | Resultado |
| --- | --- | --- |
| `/api/public/engine-api` | GET | 405, método inválido |
| `/api/public/engine-api` | POST sem credencial | 401 |
| `/api/public/engine-api` | POST com token no formato correto, inexistente | 403, inválido ou revogado |
| `/api/public/rewrite` | POST sem sessão | 401 |
| `/api/public/rewrite` | OPTIONS | 204 |

O painel continua abrindo como `Dashboard — OfertaBot`, sem alteração de apresentação.

## Testes

13 testes aprovados: 12 de PostgreSQL PGlite isolado e 1 de navegação existente. O SQL dos testes é o mesmo `supabase/schema.sql` aplicado, com schemas `auth`/`storage` simulados apenas no processo de teste.

Cobertura: RLS, autorização de viewer, precisão de bigint e rejeição de preço negativo, deduplicação de captura, fila e exclusividade de processamento, leases de 90/120 segundos, incerteza após início de envio, planos 10/50 e atribuição restrita, revogação, limpeza ao excluir conta, limite de 30 reescritas/hora e conflito de versão.

Resultado final da compilação automática: `build OK`.

## Diferenças aprovadas em relação aos arquivos fornecidos

```diff
- user_id uuid references auth.users on delete cascade
+ user_id uuid
+ public.cleanup_deleted_member() e trigger AFTER DELETE em auth.users
```

A limpeza equivalente ao cascade foi testada localmente. A ausência de FK significa que SQL administrativo poderia inserir um UUID sem conta correspondente; as APIs do contrato continuam usando `auth.uid()` e procurando usuários cadastrados.

- Concessões de acesso adicionadas imediatamente após cada CREATE TABLE, sem ampliar a escrita de usuários autenticados.
- INSERT em `storage.buckets` substituído pela configuração equivalente através da API de storage, por exigência da plataforma.
- `Deno.serve` substituído por handlers TanStack em `/api/public/engine-api` e `/api/public/rewrite`; imports `npm:` e `Deno.env` substituídos pelos recursos suportados.
- `supabase/config.toml` gerenciado foi preservado; não foram criadas novas Edge Functions nem configurações `verify_jwt`.
- Validação de envelopes e mídia com Zod; mensagens e lógica transacional do contrato mantidas.
- Correção de tipagem real no upload: acesso opcional ao campo legado `error.error` agora usa checagem `"error" in error`, preservando a identificação de duplicatas.
- Preparação de testes ajustada para também funcionar sem `window`; acessos de índices TypeScript corrigidos. Nenhuma regra de negócio foi alterada por essas correções.

## Arquivos principais

- `supabase/schema.sql`
- `supabase/migrations/20261022010000_ofertabot_backend.sql` — cópia de referência idêntica
- `drizzle/migrations/0000_ofertabot_backend.sql` — migração aplicada e idêntica
- `drizzle/migrations/meta/*` e `drizzle/schema.ts` — gerados pelo mecanismo de migrações
- `src/lib/engine-api.server.ts`
- `src/lib/rewrite.server.ts`
- `src/routes/api/public/engine-api.ts`
- `src/routes/api/public/rewrite.ts`
- `src/test/backend-rules.test.ts`
- `supabase/IMPLEMENTACAO.md`

Atualizados: dependências/lock, `src/test/setup.ts`, `AGENTS.md` e `roadmap.md`. Tipos do banco e árvore de rotas regenerados automaticamente.

## Pendências e limites

- Os endpoints são do aplicativo TanStack, não URLs de Edge Functions; disponibilidade pública definitiva depende da publicação do aplicativo, ainda não realizada.
- Sem contas reais cadastradas e com o frontend de login ainda somente visual, não foi possível testar o fluxo autenticado real e ler resultados pela interface. Esses fluxos estão cobertos localmente, mas não certificados ponta a ponta no banco hospedado.
- Upload/download com motor real, conexão WhatsApp, transporte e confirmações externas não foram exercitados; dependem do motor do usuário.
- A resposta 503 de IA não configurada foi preservada no código, mas não foi exercitada com uma sessão real por inexistência de contas.
- Cadastro/provedores de login não foram alterados nesta etapa exclusiva do backend.
- A URL interna do banco não é divulgada no Lovable Cloud; o cliente já está configurado com a URL e a chave publicável corretas. Nenhuma chave service_role é exposta.
