# Entrega OfertaBot 0.1.0 — 22/10/2026

## Links e arquivos

- **Painel publicado:** https://ofertabot-central.lovable.app. Publicação confirmada pela integração e por verificações HTTP/navegador no endereço final.
- **Editor Lovable:** https://lovable.dev/projects/6b91e5a7-7773-40fe-95df-8db9622278c5. TanStack Start/React, um banco Lovable Cloud, Auth e bucket privado `offer-media`.
- **Motor no notebook:** `ofertabot-motor.zip`, pacote independente com fontes, lockfile, instaladores, Docker e URL já definida. Não contém credencial ou sessão.
- **Código completo local:** `ofertabot-entrega.zip`, painel React/Vite portável, motor, SQL, adaptadores, testes e documentação.
- **Código do Lovable:** `lovable/project/`, snapshot manual do commit publicado `158ce5541b48f56a31483e36b09aee09eeb8cb39`. GitHub e Lovable não se sincronizam sozinhos. Proveniência em `EXPORTACAO.json` e `EXPORT-INFO.md`. Preserva TanStack e lockfile Bun. Não inclui `.env` nem segredos; o favicon binário veio do site publicado.
- **Configuração privada de teste:** `ofertabot-configuracao-teste.txt`, entregue separadamente, contém a restrição à conta escolhida pelo usuário. O número é a conta a vincular, não um destinatário. Não foi colocado nos fontes públicos.
- **GitHub para análise:** https://github.com/guilhermecoimbra072-hash/ofertabot. Repositório privado criado pelo usuário, identificado na conexão GitHub correspondente. Importação preserva o commit inicial; veja `ANALISE-IA.md` para localizar o código hospedado e o motor. Não há sincronização automática Lovable/GitHub configurada.

Atualização: cadastro e redefinição aceitam senhas a partir de **6 caracteres**. Publicação e mínimo hospedado confirmados; três testes isolados adicionais passaram, sem criação de conta.

## Funcionalidades implementadas

Login/cadastro/recuperação; empresa e permissões; dashboard com dados reais e estados vazios; credencial revogável; QR privado; grupos; captura de texto/imagem com deduplicação; edição e versões; aprovação; publicação por destino; agendamento com fuso; retenção de vencidos; histórico e revisão de resultado incerto; marca/modelos; IA opcional; editor Canvas com preço manual e OCR; planos com limites no backend; RLS e armazenamento privado.

Motor Node/TypeScript com comunicação HTTPS de saída, sessão e fila criptografadas, reconexão contínua com atraso curto, recibos persistentes e Baileys fixado. Restrição opcional de conta impede operação com número diferente do configurado. Transporte simulado é exclusivo de testes. Envios começam desabilitados; capturas nunca são aprovadas ou publicadas automaticamente.

O painel TanStack publicado foi adaptado pelo Lovable a partir do contrato e funcionalidades, preservando o cliente e as rotas da plataforma; não é cópia literal do painel Vite do pacote portável. Ambos usam o mesmo protocolo. Não há dois bancos operacionais.

## Verificações executadas

| Verificação | Resultado e alcance |
| --- | --- |
| Instalação local | `npm ci`, tipagem e build de painel/motor concluídos; auditoria sem vulnerabilidades reportadas |
| Motor independente | Lockfile próprio, instalação limpa, compilação e importação Baileys executadas; auditoria de produção: zero |
| Regras e motor locais | `npm test` tem 42 testes e passou sem WhatsApp nem segredo: autorização, isolamento, deduplicação, aprovação/versionamento, agenda, revogação, recuperação, resultados incertos, quarentena, dinheiro, restrição de conta, reconexão, confirmação de envio em grupo e instalação |
| Variante SQL Cloud | 48 testes PGlite em `lovable/project/src/test/backend-rules.test.ts`, dentro dos 178 testes Vitest do painel |
| Concorrência real | PostgreSQL 17.6 em Docker, duas sessões: claim exclusivo e revogação durante heartbeat bloqueado; 2 cenários passaram |
| Interface local | 6 testes Chromium: desktop/mobile, edição, aprovação/fila simulada, upload/final e OCR real sobre imagem sintética |
| Lovable | Migrações aplicadas, 11 tabelas RLS e bucket privado verificados. Na cópia do commit 158ce55: instalação com Bun e lock congelado, `tsc --noEmit`, ESLint sem a regra Prettier, 178 testes Vitest e build TanStack/Nitro passaram |
| Site publicado | Login inexistente rejeitado pelo Auth real (400); engine GET 405, sem credencial 401, token inexistente 403; IA sem JWT 401 |
| Navegador publicado | Login desktop 1440×1000 e celular 390×844, sem erros JavaScript ou overflow; capturas inspecionadas visualmente |
| Docker do motor | Imagem construída e execução sem root/rede testada; Baileys/cofre e restrição de conta verificados |

Evidências locais em `docs/evidence/`; `publicacao-smoke.json` registra data, URL e resultados externos. Os testes de telas autenticadas usam respostas interceptadas somente nos navegadores de teste, nunca dados demonstrativos servidos ao usuário. SQL usa identidades isoladas de teste.

O build local da exportação usou variáveis públicas fictícias, sem chamar o backend; o site publicado foi conferido separadamente. Os redirects de Auth no código usam o domínio publicado e `/?recovery=1`; a lista autorizada hospedada não foi exposta pelas ferramentas de leitura.

**Ainda não verificado de ponta a ponta:** primeiro cadastro válido, confirmação/recuperação por e-mail, upload com sessão real e fluxo com WhatsApp. Não foi criado usuário de produção para regressão. A stack Supabase local completa não coube no daemon Docker; seu roteiro está preparado, mas não é contado como teste aprovado. Banco real e motor Docker foram testados separadamente.

O build Docker neste ambiente precisou da CA do proxy via secret temporário BuildKit. TLS permaneceu habilitado e a CA não está no pacote. Em rede comum, use `docker compose build`.

## Pendências e limites

1. **Seu primeiro teste:** criar conta/empresa, emitir credencial, iniciar motor, ler QR e escolher origem/destino. Nenhuma conta WhatsApp foi vinculada e nenhuma mensagem foi enviada no desenvolvimento. Baileys 7.0.0-rc14 é integração não oficial e release candidate.
2. **Sincronização futura:** o repositório para análise contém os fontes completos, mas não foi conectado automaticamente ao editor Lovable. Alterações no GitHub não devem ser consideradas publicadas sem uma implantação confirmada.
3. **IA externa:** adaptador pronto, sem chave/API paga configurada. Edição manual funciona sem IA.
4. **Cobrança:** planos atribuídos administrativamente, sem provedor de pagamentos.
5. **Limites de versão:** uma conexão ativa por empresa; texto e uma imagem por publicação; vídeos/PDF/áudio identificados sem processamento; não há automação por regras de captura; listagens recentes têm limites sem paginação do arquivo inteiro. Windows/macOS têm instaladores e instruções, mas a execução automatizada ocorreu em Linux.

O novo conector WhatsApp Business do Lovable existe, mas não sincroniza os grupos existentes necessários ao fluxo; por isso o motor Baileys foi mantido. Fontes e limites em [WHATSAPP-LOVABLE.md](WHATSAPP-LOVABLE.md).

## Começar no notebook

1. Abra https://ofertabot-central.lovable.app e crie sua conta e empresa.
2. Instale Node.js 24 LTS e extraia `ofertabot-motor.zip`.
3. Execute `npm ci`, `npm run build`, `npm run setup` (no Windows, use `npm.cmd` se necessário).
4. Em Motor e IA, emita a credencial. Cole em `ENGINE_TOKEN` no `.env`; confira a URL e copie a linha de restrição de conta do arquivo privado entregue. Preserve a chave de sessão gerada.
5. Execute `npm run engine`, abra WhatsApp no painel e leia o QR com a conta escolhida.
6. Escolha grupos distintos, habilite os envios e faça o roteiro [PRIMEIRO-TESTE.md](../PRIMEIRO-TESTE.md).

No celular, use o mesmo painel HTTPS. Não abra portas no roteador. O notebook precisa permanecer ligado para capturas e envios.
