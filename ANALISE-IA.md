# OfertaBot — ponto de partida para análise técnica

Este repositório reúne o código entregue para revisão. O painel publicado está em https://ofertabot-central.lovable.app. O objetivo é capturar texto/imagem de grupos de fornecedores, editar, aprovar uma versão e publicar/agendar por destino, com resultado auditável.

## Onde está cada parte

| Caminho | Papel |
| --- | --- |
| `lovable/project/` | Exportação do projeto TanStack Start/React realmente hospedado no Lovable. Examine esta pasta para revisar o site publicado. `EXPORTACAO.json` registra o commit de origem. |
| `lovable/project/src/ofertabot/` | Painel publicado: autenticação, ofertas, Canvas/OCR, grupos, fila, marca, equipe e configurações. |
| `lovable/project/src/server/` e `src/routes/api/public/` dentro dessa pasta | Handlers hospedados do motor e da IA; cliente administrativo apenas no servidor. |
| `lovable/project/supabase/schema.sql` e `drizzle/migrations/` | Contrato SQL Cloud e migrações efetivamente aplicadas pela plataforma. |
| `engine/src/` | Fonte principal do motor Node/TypeScript/Baileys, polling HTTPS, sessão criptografada e recibos. |
| `src/`, `server/`, `supabase/` na raiz | Implementação portável React/Vite/Supabase e adaptadores. É alternativa de implantação, não outro banco operacional. |
| `distribuicao/motor/` | Pacote independente do motor, com fontes, lockfile e instaladores. É uma cópia de distribuição; alterações de lógica devem partir de `engine/src/`. |
| `tests/`, `docs/evidence/` | Testes locais e evidências, com limites explícitos sobre o que foi simulado. |

Há **um banco operacional**, no Lovable Cloud. Não aplicar as duas migrações iniciais nem criar banco paralelo. Esta importação no GitHub não estabelece sincronização automática com o editor Lovable. O bloco inicial do `lovable/project/AGENTS.md` veio do projeto original; não confirma vínculo deste novo repositório com o Lovable.

## Leitura recomendada

1. `README.md`, `docs/ENTREGA.md` e `PRIMEIRO-TESTE.md`: comportamento e limites atuais.
2. `docs/CONTRATO.md`: protocolo painel/motor e operações transacionais.
3. SQL e políticas do banco/storage; handlers; `engine/src/worker.ts`, `capture-queue.ts`, `baileys.ts` e `vault.ts`.
4. Testes de isolamento, concorrência, reinício, aprovação por versão e resultado incerto.
5. `docs/OPERACAO.md` e `docs/WHATSAPP-LOVABLE.md`.

## Executar verificações sem WhatsApp

Raiz, com Node.js 24 LTS:

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

Os testes SQL e transporte simulado não precisam de credencial real. `npm run test:postgres` exige Docker para os testes concorrentes. `npm run test:local` exige a stack Supabase local; a execução completa dessa stack ficou pendente no ambiente de entrega.

Dentro de `lovable/project/`, com Bun 1.4.3:

```sh
bun install --frozen-lockfile
bunx tsc --noEmit
bun run test
```

O build TanStack usa `bun run build`; variáveis públicas fictícias bastam para uma verificação de compilação, mas não tornam a aplicação funcional. Não inserir chave administrativa em `VITE_*`. Para uso real, o runtime deve apontar ao backend identificado e obter seus segredos pelo ambiente hospedado.

## Estado de verificação e pontos de revisão

- Raiz: 22 testes de regras/motor passaram; 6 testes de interface; 10 cenários da variante SQL Cloud; concorrência exercitada com PostgreSQL 17.6 e duas sessões.
- Exportação Lovable: instalação com lock congelado, tipagem e build passaram; 40 testes iniciais e 3 adicionais sobre mínimo de senha passaram. A senha mínima solicitada pelo usuário é 6 caracteres; senhas maiores continuam aceitas.
- Site publicado: login inexistente rejeitado, APIs sem credenciais bloqueadas, layouts desktop/mobile/iPad conferidos. Telas autenticadas nos testes usam interceptação de respostas; não confundir com sessão positiva de produção.
- Ainda sem teste real: confirmação/recuperação por e-mail, upload autenticado e fluxo completo de WhatsApp. Não afirmar envio real ou entrega exatamente uma vez.
- Revisar especialmente: RLS por empresa; credencial revogável e revalidação após locks; caminhos de mídia; deduplicação; captura de mensagens próprias/ciclos; versões aprovadas imutáveis; concorrência de claim; distinção entre falha recuperável e resultado incerto; retenção de horários vencidos.
- Limitações declaradas: uma conexão ativa por empresa; uma imagem por publicação; sem processamento de vídeo/PDF/áudio; sem automação por regras de captura, pagamentos ou chave externa de IA; listagens recentes sem paginação completa.

Não há senhas, sessões WhatsApp, QR real, `.env` ou número pessoal de teste nesta importação. A análise não requer conectar WhatsApp, criar contas de produção ou enviar mensagens. Registre achados com arquivo/linha, cenário de reprodução, impacto e evidência; distinga falha comprovada de hipótese e de pendência já declarada.
