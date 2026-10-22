# OfertaBot — painel integrado

## Entrega
- Painel em `src/ofertabot/`: App, Auth, ImageEditor, OfferEditor, SettingsForm, ClientApp, api, model, money, schedule, ocr, ui e styles.
- Raiz TanStack preserva QueryClientProvider, Outlet, HeadContent, Scripts e captura de erros. App é importado dinamicamente somente após montagem no navegador.
- Cliente gerado e seu armazenamento intermediado de sessão de prévia permanecem intactos. Não há outro cliente, schema ou chave administrativa no navegador.
- Rotas antigas redirecionam à raiz com a página correspondente. CSS claro é carregado depois do CSS da plataforma; o shell antigo não é montado.
- Dependências fixadas no manifesto e lockfile: qrcode 1.5.4, tipos 1.5.5; luxon 3.7.2, tipos 3.7.1; tesseract.js 6.0.1.
- Login por e-mail habilitado no Lovable Cloud após o teste identificar que estava desativado. Confirmação de e-mail não foi desativada.

## Verificações
- 40 testes aprovados: 27 regressões existentes e 13 testes de dinheiro, fuso/DST, offline, revogação e URL do motor.
- Compilação hospedada confirmada em 22/10/2026: execução `br_440b17d0-c4c8-4a88-bee1-2684a3d64a21`, commit `2d9c7a5ceee61a701a7c890e885c95a6c1be5b94`, status `succeeded`, sem diagnósticos ou alvos com falha. Isso não comprova uma verificação TypeScript separada.
- Navegador real em desktop 1280×1800 e celular 390×844: login, cadastro/recuperação sem envio, redirecionamentos, dez telas, imagem privada, Canvas, salvamento, versões, aprovação, IA indisponível, retenção, cancelamento, resultado incerto e configurações.
- OCR real no navegador identificou `R$ 129,90` com confiança de 94% na imagem isolada de teste.
- As telas autenticadas usaram respostas interceptadas exclusivamente no navegador de teste. Esses resultados NÃO equivalem a validação autenticada positiva no banco hospedado. Nenhum dado demonstrativo foi gravado no banco ou servido pelo aplicativo.
- Login inválido foi rejeitado pelo backend real e apresentou mensagem em português. Sem erros de execução nos fluxos exercitados.
- Leitura do banco: zero contas e empresas, tabelas públicas/privadas com RLS, bucket offer-media privado, limite 10 MiB e PNG/JPEG/WebP.
- Contrato utilizado: app_snapshot, app_action, offer_revisions, offer-media e rewrite com JWT da sessão. Administração continua restrita ao servidor.

## Limitações concretas
- Os arquivos do painel no contexto disponível contêm descrições, não seus conteúdos integrais. Esta implementação corresponde às funcionalidades descritas, mas não é uma cópia literal verificável dos arquivos originais.
- Entrada válida, confirmação de cadastro e recuperação por e-mail não foram verificadas com conta real. Nesta verificação final, a criação de contas e o envio de e-mails foram expressamente proibidos pelo usuário; não foram executados. Não há aprovação pendente para ajustes técnicos rotineiros.
- URL pública disponível: https://ofertabot-central.lovable.app; endpoint externo do motor: https://ofertabot-central.lovable.app/api/public/engine-api. Pode ser definido por VITE_ENGINE_URL ou VITE_PUBLIC_APP_URL; em prévia a interface explica a exigência e impede emissão sem URL válida.
- Aplicativo publicado, conforme URL retornada pela CLI e confirmação do usuário. Motor/WhatsApp não conectado, mensagens não enviadas, IA paga não configurada e nenhum serviço comprado. Envios continuam desabilitados. Nenhuma republicação foi realizada nesta verificação.
- Transporte real, fila com motor externo e upload autenticado no storage hospedado aguardam uma conta válida e motor fornecido pelo usuário.

## Auditoria das configurações
O payload de save_company recebe company_id em App.mutate antes da chamada RPC. A marca é mantida com espalhamento do objeto existente e z.record(z.string()), portanto suas chaves textuais adicionais não são removidas. A validação em navegador confirmou company_id no payload; o contrato SQL não foi modificado.

## Verificação final curta — 22/10/2026
- Publicação: `lovable urls --json` confirmou https://ofertabot-central.lovable.app. `lovable build status --json` confirmou prévia sincronizada com o commit informado pelo usuário; não é uma leitura independente do commit servido pela publicação.
- Verificações reais no site publicado, informadas pelo usuário: GET engine 405; POST sem token 401; token inexistente 403; rewrite sem JWT 401; login inexistente no Auth 400; desktop 1440 e mobile 390 sem erros JS ou overflow. Não foram repetidas nesta etapa.
- Regressões executadas nesta etapa: `bunx vitest run src/test/panel-rules.test.ts src/test/app-routing.test.tsx` — 14/14 testes aprovados.
- Comando solicitado de tipagem: `bunx tsc --noEmit` — **não executado**, pois as instruções deste ambiente proíbem rodar manualmente a tipagem do projeto. `lovable checks results --json` retornou `checks: []`; portanto não há resultado armazenado de tipagem independente, e esta verificação permanece pendente. Nenhuma aprovação adicional do usuário resolveria essa restrição do ambiente.
- Auth, somente leitura: `supabase--project_info` e a CLI disponibilizam metadados, não Site URL nem a lista hospedada de redirects. `supabase--configure_auth` escreve configurações e não permite ler ou ajustar esses dois campos; não foi chamada. A compatibilidade da configuração hospedada permanece **não verificada**, sem alterações de configuração.
- Código inspecionado: cadastro usa `emailRedirectTo: window.location.origin`; recuperação usa `redirectTo: window.location.origin + '/?recovery=1'`. No domínio publicado, os destinos são https://ofertabot-central.lovable.app e https://ofertabot-central.lovable.app/?recovery=1. Isso comprova os destinos enviados pelo painel, não sua autorização na lista hospedada. A configuração pode ser conferida em **Mais → Usuários → Configurações de autenticação**.
- Apenas este relatório e o roadmap foram atualizados; nenhum erro de código foi comprovado pelos diagnósticos disponíveis. Não houve criação de contas, e-mails, alteração de confirmação, conexão WhatsApp, envio de mensagens, contratação ou republicação.
