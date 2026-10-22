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

