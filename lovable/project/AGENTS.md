<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Preserve TanStack Start server routes under `/api/public` for external engine/rewrite HTTP calls; authenticate internally before privileged operations because these URLs bypass site authentication.
- Keep the supplied OfertaBot SQL contract in `supabase/schema.sql`; applied schema changes belong to the platform-managed Drizzle migration journal, and the matching Supabase migration is a source reference, not a second deployment mechanism.
- Keep tenant roles in the protected `members` contract table and user IDs as UUIDs; the app-owned auth lifecycle trigger removes memberships on account deletion without a forbidden managed-auth foreign key.
- Exercise backend rules in isolated PGlite tests with mocked auth/storage schemas; never seed production data for regression tests.
- Configure buckets through the storage API rather than SQL migrations; preserve private media, MIME restrictions and immutable client access.
- Keep injectable engine/rewrite handlers in src/server/*.server.ts and load the generated administrative export inside HTTP handlers; this preserves server-only credentials and permits isolated tests.
- Keep the supplied complete panel in src/ofertabot and dynamically load App only after client mounting; Canvas, OCR, auth and storage must never execute during SSR.
- Use the generated browser client and React Query for panel snapshots/mutations; preserve preview auth storage rather than creating another client.
- Load panel CSS after platform CSS and keep legacy routes as redirects to the root panel; this removes duplicate shells while preserving infrastructure.

- Keep panel visual tokens and shared presentation in src/ofertabot/styles.css with fonts loaded by the root head; isolate interface restyling from Canvas artwork tokens so generated offer images do not change.
- Daily activity reads all date-filtered pages through the generated browser client and tenant RLS; use received_at and sent_at in the company timezone, never infer missing failure timestamps.
- Platform reads use an authenticated SQL RPC guarded by private operator membership; mutations use an authenticated server function, recheck membership in SQL, and load the administrative client only after verification. Tenant snapshots expose only membership and the platform flag, never other tenants.
- Preserve existing SQL RPC bodies through checked additive definition patches; monthly AI charges retain original cost/month in a private ledger so refunds do not depend on later configuration changes.
- Track publication failure transitions with a timestamp trigger and backfill only from verified failure audit events; unknown historical failure dates are never inferred from creation dates.
- Keep platform presentation separate in src/ofertabot and share document-level persisted theme controls; panel-only theme tokens must not alter offer artwork.

- Offer saves await the current ImageEditor enhancement promise before rendering/uploading artwork; a save-only safety wait falls back without aborting the gateway/cache, preventing early or late image races.
