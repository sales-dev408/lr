# Deploying to Cloudflare

Cloudflare hosts the **two web frontends**. The Node/Fastify backend and
PostgreSQL run elsewhere (Cloudflare has no Postgres, and Workers can't run
Fastify + `pg` unchanged); put Cloudflare in front of them for DNS/TLS/WAF.

```
Cloudflare Workers (Static Assets)          Supabase Edge Functions        Supabase Postgres
  ├─ lr-admin-dashboard  (SPA)  ── /api ──▶  router function  ── HTTP ──▶  database
  └─ lr-vendor-portal    (SPA)               (preserves /api/*)
Cloudflare DNS/CDN/WAF in front of the frontends (optional for the API too)
```

## 1) Frontends — Cloudflare Workers Static Assets (two projects)

Each app ships a `wrangler.jsonc` that serves `./dist` with SPA fallback
(`not_found_handling: single-page-application`). That handles deep-link routing —
do **not** add a `_redirects` file with a `/* /index.html 200` rule alongside it;
Workers Static Assets rejects that as an infinite-loop redirect and the deploy fails.

Create **two** projects (they cannot share one — each needs its own root dir):

| Setting | admin-dashboard | vendor-portal |
|---|---|---|
| Root directory | `admin-dashboard` | `vendor-portal` |
| Build command | `npm install && npm run build` | same |
| Deploy command (prod) | `npx wrangler deploy` | same |
| Deploy command (non-prod branches) | `npx wrangler versions upload` | same |
| Build variable | `VITE_API_BASE_URL=https://api.yourdomain.com/api` | same |

`VITE_API_BASE_URL` is inlined by Vite **at build time** — set it as a build
variable and rebuild after any change.

### CLI alternative
```bash
npm i -g wrangler && wrangler login
cd admin-dashboard && npm install && npm run build && npx wrangler deploy
cd ../vendor-portal && npm install && npm run build && npx wrangler deploy
```

## 2) Backend — Supabase Edge Functions

Deploy a single Edge Function named `router` and keep the existing `/api/*`
contract. Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`,
`VENDOR_PORTAL_URL`, `ADMIN_DASHBOARD_URL`, POS/Square keys, and any other
provider secrets you use.

Frontend requests should point at:

```text
https://<project>.supabase.co/functions/v1/router
```

That keeps calls like `/api/auth/login` and `/api/admin/cards` intact while
moving the actual backend runtime into Supabase.

## 3) Database — managed Postgres

Neon or Supabase (or Railway/RDS). Put its connection string in the backend
`DATABASE_URL`. Cloudflare D1 is SQLite, not a drop-in for this schema.

## 4) Mobile — not Cloudflare

Build via Expo EAS → App Store / Play Store; point `EXPO_PUBLIC_API_BASE_URL` at
the same backend URL.

## Common gotchas
- **CORS:** the Edge Function must allow both Cloudflare frontend URLs.
- **SPA 404s:** handled by the `wrangler.jsonc` SPA fallback; don't add a `/* /index.html` `_redirects` rule (Workers rejects it as an infinite loop).
- **Worker name:** `wrangler.jsonc` uses `lr-admin-dashboard` / `lr-vendor-portal`. Name your Cloudflare Workers/Pages projects to match, or connected builds will warn and try to open a rename PR.
- **Stale API URL:** `VITE_API_BASE_URL` is build-time — redeploy after changing it.
