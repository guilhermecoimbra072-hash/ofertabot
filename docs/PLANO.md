# OfertaBot — plano de entrega

Requisitos: pedido completo do usuário nesta sessão, incluindo isolamento por empresa, captura de texto e imagem, aprovação e publicação auditável. Autorização para executar decisões rotineiras e recursos OfertaBot; nenhuma compra ou mensagem real.

Arquitetura: React/TypeScript compatível com Lovable; Supabase Auth, PostgreSQL e Storage privado como única fonte de dados; motor Node persistente com Baileys e polling HTTPS de saída. Sem Redis. Credencial revogável do motor restrita à conexão/empresa. Sessão WhatsApp criptografada no notebook.

- [x] Banco: tabelas, RLS, RPC transacionais, versões aprovadas, deduplicação, limite de grupos, fila com leases, política de atraso e resultado incerto. Testar migração e permissões em PostgreSQL embarcado PGlite.
- [x] Motor: transporte real separado de simulado, QR privado, sessão persistente, captura e envio confirmado pelo transporte; testar reinício e incerteza sem WhatsApp real.
- [x] Painel: autenticação, onboarding, estados vazios reais, grupos, editor de texto/imagem, OCR assistido, aprovação, agenda, histórico, marca e administração.
- [x] Lovable: backend aplicado e painel publicado, com smoke tests externos.
- [x] GitHub: usuário criou `guilhermecoimbra072-hash/ofertabot`; importação dos fontes completos para análise, preservando o commit inicial.
- [ ] Primeiro uso real: cadastro positivo, e-mail, vínculo WhatsApp e envio guiado pelo usuário.
- [x] Entrega: instalação, lockfile, Docker, guias pt-BR, evidências de testes e arquivo para download.

Decisões: origens e destinos são disjuntos para impedir ciclos; grupos ativos únicos contam uma vez por conexão e JID. Automação por captura permanece desativada. Publicações manuais também exigem habilitação explícita de envio. Agendamentos atrasados mais que a tolerância ficam retidos para liberação manual. Envio iniciado sem confirmação vira incerto e nunca volta automaticamente à fila.

Revisão: concorrência entre motores, isolamento de caminhos de imagens, revogação durante envio, precisão monetária e mudança de aprovação durante agendamento.
