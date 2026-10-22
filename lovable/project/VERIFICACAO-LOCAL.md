# Exportação e verificação local

Código do OfertaBot exportado do Lovable. A publicação confirmada usa o commit `2d9c7a5ceee61a701a7c890e885c95a6c1be5b94`; os dois relatórios em `src/ofertabot/IMPLEMENTACAO.md` e `roadmap.md` foram atualizados no commit `888282b63858d26e279d6e362e72a8bfcd2f8862`, sem mudança funcional.

Após exportar, neste ambiente Linux/Node 24.19.0, foram executados:

- Instalação Bun 1.4.3 com lockfile congelado: sucesso.
- TypeScript 5.9.3, `tsc --noEmit`: sucesso.
- Vitest 4.1.11: 5 arquivos, 40 testes aprovados.
- Vite 8.1.5, cliente + SSR + Nitro: compilação concluída. Usou URL/chave públicas fictícias apenas para compilar, sem acesso ao backend.

Isso resolve localmente a pendência de tipagem descrita no relatório remoto. O site https://ofertabot-central.lovable.app também foi testado em Chromium desktop/mobile e rejeitou login inexistente e chamadas sem credenciais. Login positivo, confirmação de e-mail, recuperação, storage autenticado e WhatsApp real ainda aguardam teste do usuário. A lista hospedada de redirects Auth não foi acessível.

O pacote preserva a stack e arquivos da plataforma, excluindo `.env`, metadados privados `.lovable/`, arquivos binários, node_modules e builds. O favicon binário não foi exportado. Nenhuma migração deve ser reaplicada como inicial no banco em uso. Veja `EXPORTACAO.json` para proveniência.

Para o primeiro teste, use o painel publicado e o pacote separado `ofertabot-motor.zip`; não é necessário executar este frontend no notebook. Os fontes locais portáveis e guias estão em `ofertabot-entrega.zip`.

Atualização publicada: c687b5ae647fec3ac950ade6ab2cb335260edda2 altera mínimo para 6 caracteres no cadastro e recuperação, mantendo senhas maiores e login existente. Três testes isolados adicionais passaram. Site publicado verificado em viewport de iPad, com cadastros interceptados; resposta negativa real do Auth confirma mínimo 6, sem criar conta. Detalhes em docs/evidence/password-policy-smoke.json no pacote completo.
