# Media resolver deployment

The frontend stays on GitHub Pages. Deploy `functions/resolve-media/index.ts` to the existing Supabase project. No movie files are stored or proxied by the function.

With the Supabase CLI installed and signed in, run from the repository root:

```sh
supabase functions deploy resolve-media --project-ref wmbxqwciyynyzqirgive
```

Keep JWT verification enabled (configured in `config.toml`). The frontend sends the existing public anon JWT, never a service-role key. This is a guest-facing endpoint; the public key and CORS allowlist are not user authentication or a global rate limiter. Monitor invocation usage before expanding access.

Alternatively, create a function named `resolve-media` in the Supabase dashboard, paste `functions/resolve-media/index.ts`, and deploy with JWT verification enabled.

The function accepts only HTTPS `cinema.albox.co/show/play/<numeric-id>` URLs and fetches a fixed metadata endpoint. Redirects are rejected; returned media must be HTTPS on Albox cloud hosts. Allowed frontend origins are listed at the top of the function.

Test after deployment: paste an Albox playback-page link into Sahra, press Load, then choose a quality. Available subtitles load automatically. The host broadcasts the selected source and subtitle metadata to friends and saves them for refresh restoration.

Albox must be reachable from the Supabase region as well as each viewer's network. Local metadata tests do not guarantee cloud-region access. Provider API changes may require resolver updates. No authentication, DRM, or access restrictions are bypassed.

Deployment check (2026-09-27): `resolve-media` is deployed with JWT verification enabled. Albox movie 1071678 resolves from the local PC, but the deployed function receives HTTP 404 from the upstream metadata endpoint and reports `UPSTREAM_REJECTED`. Cloud resolution is not operational for this test movie; deployment alone does not resolve that upstream difference.

Deployment reference: https://supabase.com/docs/guides/functions/deploy
