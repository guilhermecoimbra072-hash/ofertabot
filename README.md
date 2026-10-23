# OfertaBot

**Para análise técnica:** comece por [ANALISE-IA.md](ANALISE-IA.md). O projeto publicado está em `lovable/project/`, um snapshot manual do commit Lovable `158ce5541b48f56a31483e36b09aee09eeb8cb39`. GitHub e Lovable não se sincronizam sozinhos. O motor independente está em `distribuicao/motor/`.

**Painel publicado:** https://ofertabot-central.lovable.app — backend e armazenamento privado implantados no Lovable Cloud. O primeiro cadastro válido e o teste com seu WhatsApp ainda precisam ser feitos por você. Veja [docs/ENTREGA.md](docs/ENTREGA.md).

Plataforma em português para capturar ofertas de grupos de fornecedores, revisar texto e imagem e publicar uma versão aprovada em grupos escolhidos. Painel responsivo e motor Node/TypeScript separado, executado no notebook ou futuramente em VPS.

**Comece pelo [PRIMEIRO-TESTE.md](PRIMEIRO-TESTE.md).** A vinculação do WhatsApp e a escolha dos grupos são feitas por você. Nenhuma mensagem real foi enviada durante o desenvolvimento.

## Estrutura

- `src/`: painel React; pode ser incorporado à stack React/TanStack do Lovable sem Next.js.
- `supabase/schema.sql`: esquema canônico, RLS, APIs transacionais e limites.
- `supabase/functions/`: gateway limitado do motor e reescrita opcional com IA.
- `engine/src/`: Baileys, cofre AES-256-GCM, captura persistente e publicação com recibos.
- `tests/`: PostgreSQL PGlite e transporte simulado, separados da operação real; testes de navegador.
- `docs/`: contrato, operação, decisões e evidências de entrega.

## Instalar e executar

Para usar, abra o painel publicado e instale somente `ofertabot-motor.zip` no notebook. O pacote `ofertabot-entrega.zip` contém também o painel portável e os testes; `ofertabot-lovable.zip` contém os fontes exportados da implementação TanStack hospedada. As duas implementações de painel são alternativas e não criam outro banco.

Requer Node.js 22.12+ (recomendado Node 24 LTS), npm e acesso à internet.

```sh
npm ci
npm run build
npm run setup
# Preencha .env conforme PRIMEIRO-TESTE.md
npm run engine
```

O painel publicado já funciona sem instalar frontend no notebook. Somente no pacote completo de desenvolvimento, `npm run dev` abre `http://localhost:5173`; essa alternativa exige configurar as variáveis públicas do mesmo backend. Para o celular, use o painel hospedado com HTTPS. Não é necessário abrir portas do roteador. `npm run engine` não abre servidor HTTP.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

`npm test` cobre 39 casos do motor e das regras, sem credencial de WhatsApp. A integração contínua no GitHub repete instalação limpa, tipagem, build e esses testes na raiz, e tipagem, lint, Vitest (178 casos, `bunx vitest run`) e build em `lovable/project`. Playwright, PostgreSQL concorrente e a stack Supabase local continuam opcionais.

A integração Baileys está fixada em `7.0.0-rc14`, versão publicada no registro npm, instalada, importada e tipada neste ambiente. É uma **release candidate** e uma integração não oficial: a compatibilidade real de vinculação e envio depende do seu teste. Não há promessa de estabilidade do protocolo nem de entrega exatamente uma vez. `package-lock.json` fixa a árvore instalada. `npm audit` faz parte da verificação.

## Operação e limites intencionais

- Um banco Supabase para usuários, empresas, grupos, ofertas e publicações. O armazenamento do motor contém somente sessão, capturas ainda não sincronizadas e recibos; não é um segundo cadastro de negócios.
- Uma conexão ativa por empresa neste primeiro teste. Vários usuários, com proprietário, administrador, editor e leitor.
- Capturas nunca disparam publicação automática. O controle de envio começa desligado; habilitar permite apenas tarefas aprovadas e criadas explicitamente pelo usuário.
- Um envio por conexão por vez, intervalo mínimo configurável de 10 a 3.600 segundos; padrão 30 segundos.
- Atraso superior à tolerância (padrão 5 minutos) retém o agendamento; o usuário deve liberar. Notebook desligado aparece offline após 90 segundos.
- Texto e uma imagem por mensagem WhatsApp. Álbum do WhatsApp chega como mensagens individuais. Originais preservados; snapshot de publicação usa uma imagem selecionada/final por oferta.
- Vídeo, áudio e PDF são identificados como não processados; não são baixados nem aprovados como se estivessem prontos.
- OCR no navegador via Tesseract, com download de modelos no primeiro uso. Resultados são sugestões e exigem revisão; seleção manual funciona sem OCR.
- Preços são inteiros em unidades mínimas e strings no cliente. BRL/USD/EUR: 2 casas; PYG: 0. Sem conversão automática de moeda.
- Confirmação significa ACK do servidor WhatsApp, não leitura ou recebimento por todos os integrantes.
- Perda de confirmação depois de iniciado resulta em **incerto**, sem reenvio automático. Revisão manual no histórico não envia mensagens.
- Planos: Básico 10, Profissional 50, Empresarial configurável. Contam grupos únicos ativos por conexão/JID, seja origem ou destino. Um grupo não pode ocupar as duas funções. Cobrança ainda não integrada.
- Listagens do painel: 500 ofertas, 1.000 publicações e 200 eventos recentes; totais do dashboard são calculados sobre todos os registros. Paginação e pesquisa em todo o arquivo histórico ficam para evolução.
- Mensagens recebidas enquanto o motor está completamente desligado não têm recuperação histórica garantida. Capturas já recebidas e gravadas localmente são reenviadas ao backend com deduplicação.

## Implantação

Leia [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md), [docs/CONTRATO.md](docs/CONTRATO.md) e [docs/OPERACAO.md](docs/OPERACAO.md). As URLs e o estado confirmado de publicação estão em [docs/ENTREGA.md](docs/ENTREGA.md).

As chaves de IA ficam exclusivamente no backend hospedado (rotas TanStack no Lovable ou Edge Functions no pacote Supabase). O projeto funciona sem IA externa. Atribuir um plano não cria cobrança. Não há credenciais administrativas no painel, no motor ou nos arquivos de exemplo.

A verificação do novo conector oficial está em [docs/WHATSAPP-LOVABLE.md](docs/WHATSAPP-LOVABLE.md). Ele não sincroniza os grupos existentes do celular e não substitui o motor desse fluxo.
