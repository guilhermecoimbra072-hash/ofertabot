# Verificação do conector WhatsApp Business

Verificado em 22/10/2026 no catálogo do workspace do OfertaBot e na documentação oficial.

## Resultado

O Lovable possui o conector **WhatsApp Business**, identificador `whatsapp`, habilitado no catálogo desta conta. A listagem de conexões cadastradas retornou zero: disponível no catálogo não significa conta conectada. Nenhum número foi vinculado e nenhuma mensagem foi enviada.

O conector usa autorização da Meta (Embedded Signup). Permite receber mensagens de clientes, responder, enviar modelos aprovados e acompanhar estados de envio, entrega e leitura. O recebimento exige aplicativo TanStack Start publicado, como a stack do projeto criado para OfertaBot.

## Por que não substitui o motor de grupos deste projeto

- A documentação da Meta para coexistência com o aplicativo WhatsApp Business afirma: **“Group chats will not be synchronized.”** Os grupos já existentes no celular não são importados nem ficam disponíveis como conversas sincronizadas.
- A Meta tem uma API oficial de grupos, mas para grupos criados por essa API: até **8 participantes**, conta **Official Business Account (OBA)** e número elegível. A documentação exclui números do aplicativo WhatsApp Business e Multi-solution Conversations. Não equivale a entrar nos grupos de fornecedores já usados pela loja.
- O Lovable documenta **uma conexão WhatsApp Business por projeto**, compartilhada pelos projetos vinculados, e ausência de login WhatsApp por usuário final. Não atende diretamente à vinculação de um número independente por empresa no SaaS.
- A Meta cobra o uso diretamente; créditos do Lovable não incluem esse consumo. Nada foi contratado ou ativado.

Decisão: manter Baileys para o primeiro teste de captura/republicação em grupos existentes. É uma dependência não oficial, com compatibilidade sujeita ao teste real. O conector oficial é uma possível extensão para atendimento individual, após definir conta, isolamento e custos; não foi adicionado como integração fictícia.

## Fontes

- [Lovable: WhatsApp Business](https://docs.lovable.dev/integrations/whatsapp)
- [Meta: coexistência e sincronização do aplicativo](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Meta: Groups API e limites](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/)

As páginas da Meta foram consultadas diretamente por HTTP com resposta 200. Limites e disponibilidade podem mudar; revalidar antes de acrescentar um novo transporte.
