# OfertaBot — backend aprovado
- [x] Integrar painel: auth, empresas, navegação, Canvas/OCR, revisão e fila; correspondência literal limitada pela ausência dos conteúdos completos no pedido disponível.
- [x] Aplicar visual claro e redirecionar rotas legadas sem shell/login fake.
- [x] Validar telas desktop/mobile com interceptações isoladas, login inválido real, 40 testes e compilação automática; registrar limites da validação.
- [x] Aplicar revisão final incremental: grupos revogados, revalidação pós-lock e captura auditada sem conteúdo.
- [x] Mover handlers de servidor, executar 27 regressões e verificar APIs/RLS/Storage/compilação.
- [ ] Sessão real positiva, confirmação e recuperação: aguardam uso com conta real; criação de contas e envio de e-mails estão proibidos nesta verificação, sem aprovação técnica pendente.
- [x] Conferir banco vazio e cliente gerado.
- [x] Aplicar SQL e configurar bucket privado.
- [x] Adaptar engine-api e rewrite para endpoints TanStack.
- [x] Executar testes de regras e verificar banco/endpoints públicos.
- [x] Registrar diferenças e resultados em src/ofertabot/IMPLEMENTACAO.md.
- [ ] Correspondência literal do painel: conteúdos integrais dos arquivos não estão disponíveis nesta mensagem, somente descrições.
- [ ] Transporte/mídia com motor real: aguarda motor conectado do usuário.
- [x] Publicação pública confirmada: https://ofertabot-central.lovable.app. A exportação no repositório é o commit `c687b5ae647fec3ac950ade6ab2cb335260edda2` (`EXPORTACAO.json`). O commit anterior `2d9c7a5ceee61a701a7c890e885c95a6c1be5b94` foi a publicação imediatamente anterior à redução da senha mínima para 6.
- [x] Registrar verificações reais do usuário no site publicado; confirmar URL pela CLI e compilação hospedada sem diagnósticos.
- [x] Executar novamente testes relevantes do painel: 14/14 aprovados.
- [x] Tipagem independente da exportação: `bunx tsc --noEmit` passou fora do ambiente que proibia o comando, conforme `docs/ENTREGA.md` e `docs/PROGRESSO.md`. A pendência antiga deste arquivo estava desatualizada.
- [ ] Lista hospedada de redirects de Auth: o código envia `/?recovery=1` no domínio publicado. A lista autorizada no provedor de Auth não é legível pelas ferramentas de leitura; conferir em Mais → Usuários → Configurações de autenticação.

