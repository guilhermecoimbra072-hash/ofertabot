# Exportação do painel OfertaBot Central (Lovable)

- Projeto Lovable: OfertaBot Central (6b91e5a7-7773-40fe-95df-8db9622278c5)
- Commit exportado: 158ce5541b48f56a31483e36b09aee09eeb8cb39 (igual ao HEAD atual e à versão publicada em https://ofertabot-central.lovable.app)
- Exportado em: 2026-10-23 16:33 -03 (America/Asuncion, UTC-3)
- Arquivos nesta pasta: 172 (incluindo este EXPORT-INFO.md e .env.example)
- Arquivos no repositório Lovable nesse commit: 171

## Observações
- `.env` NÃO incluído. Ele só tem valores públicos do Supabase (URL, project id, chave publishable), mas foi trocado por `.env.example` com os nomes das variáveis e valores vazios.
- `public/favicon.ico` é binário e o conector do Lovable não lê binários sem corromper. Foi baixado do site publicado (https://ofertabot-central.lovable.app/favicon.ico), que serve esse mesmo commit.
- Não incluídos: node_modules, build (.output, dist, .wrangler) e segredos. Nenhum desses está no repositório Lovable.
- O lockfile é `bun.lock` (bun). Instalar com `bun install`. Testes: `bunx vitest run` (178/178 no Lovable).
- Varredura de segredos: nenhuma chave privada, service role, token ou senha. A única chave encontrada é a publishable (pública) do Supabase, citada em supabase/IMPLEMENTACAO.md.
- O conector exporta só o conteúdo dos arquivos. Bits de permissão e o histórico git não vêm junto.
