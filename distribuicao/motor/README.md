# Motor OfertaBot

Requer Node.js 24 LTS. Na pasta extraída, execute:

```sh
npm ci
npm run build
npm run setup
```

No Windows, use npm.cmd se o PowerShell bloquear npm. Abra .env e preencha ENGINE_URL e ENGINE_TOKEN emitidos em Motor e IA no painel publicado. Preserve ENGINE_SESSION_KEY. Para restringir a conta, informe ENGINE_EXPECTED_PHONE com DDI; esse campo não é um destinatário. Execute npm run engine, abra WhatsApp no painel e leia o QR privado com o celular. Escolha grupos distintos de origem e destino de teste; depois habilite envios no painel e crie uma publicação de oferta aprovada.

O motor não abre portas. Mantenha notebook ligado e conectado. Ctrl+C encerra preservando a sessão. Não compartilhe .env, .engine-data nem QR. A integração Baileys é não oficial. Nenhum transporte real foi executado na preparação deste pacote. Notebook offline retém agendamentos vencidos conforme tolerância; resultados incertos exigem revisão e não são repetidos automaticamente.

Use npm run health para conferir comunicação. Docker: docker compose build e docker compose up -d, somente após configurar .env. Não execute notebook e VPS ao mesmo tempo para a mesma credencial.
