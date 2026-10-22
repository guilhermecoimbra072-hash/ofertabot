# Contrato painel ↔ backend ↔ motor (v1)

## Uma única fonte de dados

O painel usa Supabase Auth e o PostgreSQL deste projeto. Todas as decisões de acesso, plano, aprovação, versão e fila são tomadas no banco. O motor não tem senha do banco nem chave administrativa. O cofre local é uma fila de sincronização e uma sessão de transporte, nunca um segundo cadastro de empresas ou ofertas.

## Autenticação do painel

JWT Supabase do usuário, obtido por cadastro/login. Leituras diretas têm RLS. `app_snapshot(p_company uuid default null)` retorna empresas acessíveis, empresa atual, conexões, grupos, ofertas, publicações, eventos, modelos, equipe autorizada e totais. QR só aparece a proprietário/administrador e se não expirou. Não há permissão de escrita direta em tabelas pelo cliente.

`app_action(p_action text, p_payload jsonb)` faz a mutação transacional. Todas as ações, exceto criação de empresa, exigem `company_id`; esse ID é conferido contra `auth.uid()` e `members`, não confiado por vir do navegador. UUIDs de oferta, grupo, conexão e publicação também precisam pertencer à empresa.

| Ação | Dados principais | Autorização |
|---|---|---|
| `create_company` | name, timezone IANA | usuário autenticado, até 5 empresas próprias |
| `save_offer` | id, version, edited_text, edited_image, uploaded_original opcional, price_minor string, currency | editor ou administrador; versão otimista; invalida aprovação |
| `approve_offer` / `reject_offer` | id, version | editor ou administrador |
| `enqueue` | offer_id, version, group_ids[], scheduled_at UTC ou null, timezone IANA, idempotency_key UUID | editor ou administrador; oferta aprovada e envio habilitado |
| `cancel_publication` | id | antes de `send_started_at` |
| `release_publication` | id, scheduled_at futuro, timezone | apenas agendamentos retidos |
| `resolve_publication` | id, resolution sent/failed, note | administrador; apenas resultado incerto; não envia |
| `set_groups` | groups[{id,is_source,is_destination}] | administrador; limite do plano dentro da mesma transação |
| `save_company` | name, timezone, brand, settings | administrador; não altera plano |
| `save_template` | name, body | editor ou administrador |
| `issue_engine` / `revoke_engine` | label / connection_id | administrador; uma conexão ativa |
| `set_member` / `remove_member` | email+role / user_id | administrador; proprietário não pode ser removido |

Snapshots de publicação guardam texto, imagem e versão aprovados. Restrição única `(offer_id, offer_version, group_id)` impede duplicar a mesma publicação, mesmo usando outro UUID de clique. A versão seguinte só pode publicar após nova aprovação. Valores de dinheiro usam `bigint` no banco e strings no JSON, sem aritmética de ponto flutuante.

## Transporte do motor

HTTPS POST para a URL `ENGINE_URL`:

- Lovable TanStack: `https://<painel>/api/public/engine-api`.
- Supabase independente (alternativa): `https://<supabase>/functions/v1/engine-api`.

São adaptadores do mesmo contrato e banco, não dois sistemas paralelos. O pacote contém ambos para portabilidade.

```json
{
  "action": "heartbeat",
  "payload": {"instance_id":"UUID do processo", "status":"disconnected", "qr":null}
}
```

Header `Authorization: Bearer ob_<64 caracteres hexadecimais>`. Token tem aproximadamente 244 bits aleatórios, é exibido uma vez e só seu hash SHA-256 fica no banco privado. É vinculado a uma conexão/empresa e pode ser revogado. As rotas nunca aceitam `company_id` escolhido pelo motor: derivam do token. Funções RPC do motor são exclusivas de `service_role`; apenas o backend possui essa chave.

| Ação | Efeito |
|---|---|
| `heartbeat` | renova lease de instância por 90s, atualiza estado/QR, recebe origens e configurações; recupera tarefas expiradas |
| `groups` | sincroniza JID/nome dos grupos, sem ativá-los automaticamente |
| `upload` | valida imagem PNG/JPEG/WebP até 10 MB e lease; grava caminho determinístico privado sem sobrescrever |
| `capture` | valida origem, ignora próprias, deduplica conexão+grupo+message_id; preserva texto/imagens |
| `claim` | reserva no máximo uma tarefa da conexão, lease de 120s e token exclusivo |
| `download` | permite apenas imagem da publicação em processamento da conexão |
| `begin_send` | revalida lease, destino e habilitação; registra início e reserva intervalo mínimo |
| `finish` | confirma sent+transport_id, falha segura anterior ao envio ou uncertain após início |

O loop usa polling de 5s e heartbeat independente de 20s. Grupos são sincronizados ao conectar (e de novo em cada reconexão) e, enquanto a sessão permanece aberta, a cada 15 minutos. O processo não expõe portas. Revogação impede próximas chamadas; não consegue desfazer um envio que já chegou ao transporte.

## Falhas, reinício e concorrência

A empresa é bloqueada transacionalmente antes de modificar fila/limites. Só uma instância possui lease da conexão. Só uma publicação da conexão fica em processamento. `claim` usa lock e `SKIP LOCKED`.

1. Interrupção antes de `begin_send`: a lease expira e a tarefa pode ser repetida até o limite.
2. Interrupção depois de `begin_send`: vira incerta. Nunca retorna automaticamente à fila.
3. Confirmação de transporte recebida, mas backend offline: recibo criptografado é persistido; o motor tenta enviar **o recibo**, sem repetir WhatsApp.
4. Se o backend já encerrou a lease, a evidência fica no cofre `unresolved-<id>.enc` e o histórico exige revisão manual. Isso não bloqueia novas tarefas.
5. Falhas recuperáveis antes do transporte: até 1–5 tentativas configuradas, espaçadas por 30×tentativa segundos, máximo 5 minutos.
6. Agendamento vencido além de 60–3.600s configurados (padrão 300s): `on_hold=true`, sem descarga acumulada ao reconectar.

Confirmação utilizada: evento Baileys `messages.update` com status `SERVER_ACK` ou superior. Limite de espera 45s. Isso não garante leitura, nem entrega exatamente uma vez.

## Arquivos e IA

Bucket `offer-media` privado, paths começam com UUID da empresa. Cliente pode inserir e ler conforme papel, mas não atualizar/apagar; originais e imagens publicadas permanecem. URLs assinadas duram 120s e são renovadas no painel. Upload original adicionado pelo usuário é preservado separadamente do arquivo final.

Reescrita: POST `/api/public/rewrite` (Lovable) ou Edge Function `rewrite`, JWT do usuário, `{company_id,offer_id}`. O backend busca a oferta autorizada e prompt da empresa. A API key nunca vem do frontend. No painel publicado a chave é `LOVABLE_API_KEY` e o endpoint é `https://ai.gateway.lovable.dev/v1/chat/completions` (provedor padrão `lovable`, modelo padrão `openai/gpt-6-luna`, sem `temperature`). `AI_MODEL` pode substituir o modelo. A função de borda deste repositório usa a mesma chave e o mesmo gateway; sem `AI_MODEL`, o modelo dela é `google/gemini-2.5-flash`. Sem essa chave, e sem `OPENAI_API_KEY` numa instalação Supabase independente, a rota responde indisponível e a edição manual permanece. Limite por empresa: 30 chamadas/hora. Sugestão não altera a oferta automaticamente.
