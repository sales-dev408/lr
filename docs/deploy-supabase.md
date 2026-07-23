# Deploying the backend and database on Supabase

This repo can keep the existing `/api/*` contract while moving the backend logic
into a Supabase Edge Function router and the data layer into Supabase Postgres.

## Target architecture

```
Cloudflare Pages / Workers  --->  https://<project>.supabase.co/functions/v1/router
                                   |
                                   +--> Supabase Postgres
```

## 1) Create the Supabase project

1. Create a new Supabase project.
2. Save the project URL, anon key, and service-role key.
3. Enable required extensions:

```sql
create extension if not exists pgcrypto;
create extension if not exists citext;
```

## 2) Create the database schema

Run the repo migrations against Supabase Postgres. The schema currently lives in:

- `backend/src/db/migrations/001_init.sql`
- `backend/src/db/migrations/002_pos_integration.sql`

For a clean Supabase deployment, load those migrations into the Supabase SQL
editor or run them with your preferred SQL client.

## 3) Move the backend contract to a Supabase Edge Function

Use a single Edge Function named `router` so the URL becomes:

```text
https://<project>.supabase.co/functions/v1/router
```

The frontends can keep calling the existing paths:

- `/api/auth/login`
- `/api/admin/cards`
- `/api/vendor/cards`
- `/api/redeem`
- etc.

That preserves the current `/api` contract while changing only the backend host.

## 4) Configure environment variables

Edge function (set with `supabase secrets set`):

- `SUPABASE_DB_URL` — Postgres connection string the function connects to (the
  pooled string from Project Settings -> Database works well). `DATABASE_URL` is
  accepted as a fallback.
- `PGSSLMODE=require`
- `JWT_SECRET`
- `JWT_EXPIRES_IN` (optional, defaults `7d`)
- `POS_TOKEN_ENC_KEY`
- `POS_STATE_SECRET`
- `VENDOR_PORTAL_URL`
- `ALLOWED_ORIGINS` — comma-separated list of the Cloudflare frontend origins
- POS/Square/Apple/Google provider keys as needed (same names as `backend/`)
- `PASSCREATOR_API_KEY` — Passcreator API key used to create wallet passes. Sent
  verbatim in the `Authorization` header (no `Bearer` prefix).
- `PASSCREATOR_TEMPLATE_ID` — id of the Passcreator template for the all-in-one
  membership pass. (`PASSCREATOR_TEMPLATEID` is accepted as an alias.)
- `PASSCREATOR_BASE_URL` (optional, defaults `https://app.passcreator.com/api/v3`)

If `PASSCREATOR_API_KEY` and `PASSCREATOR_TEMPLATE_ID` are not both set, the app
still works but membership passes are created without a hosted wallet URL and
`walletUrl` comes back `null`.

Note: the function talks to Postgres directly over the connection string, so the
REST `SUPABASE_URL` / anon / service-role keys are not required by the router
itself.

Deploy the function and schema with the Supabase CLI:

```bash
supabase login
supabase link --project-ref <project-ref>
# schema (or paste the two SQL migrations into the SQL editor)
psql "$SUPABASE_DB_URL" -f backend/src/db/migrations/001_init.sql
psql "$SUPABASE_DB_URL" -f backend/src/db/migrations/002_pos_integration.sql
psql "$SUPABASE_DB_URL" -f backend/src/db/migrations/003_discount_workflow.sql
psql "$SUPABASE_DB_URL" -f backend/src/db/migrations/004_membership_card.sql
# function
supabase secrets set SUPABASE_DB_URL=... JWT_SECRET=... POS_TOKEN_ENC_KEY=... ALLOWED_ORIGINS=... \
  PASSCREATOR_API_KEY=... PASSCREATOR_TEMPLATE_ID=...
supabase functions deploy router
```

Frontend build vars:

- `VITE_API_BASE_URL=https://<project>.supabase.co/functions/v1/router`

## 5) Connect Cloudflare frontends

Cloudflare Pages / Workers still host the admin and vendor frontends. Point both
to the Supabase function base URL above and keep the SPA fallback config that is
already in the repo.

## 6) Fusion / hybrid model (Supabase + Render interchangeable)

The backend runs as **two interchangeable implementations of the same `/api/*`
contract**:

- **Supabase Edge Function** — `supabase/functions/router/` (Deno). Primary host.
- **Fastify server** — `backend/` (Node). Kept fully intact as the rollback host.

Because both expose identical paths, request bodies, responses, and status
codes, the frontends and mobile app switch between them by changing **one build
variable** — no code changes:

```text
# Supabase
VITE_API_BASE_URL=https://<project>.supabase.co/functions/v1/router
# Render (Fastify)
VITE_API_BASE_URL=https://api.yourdomain.com/api
```

Both talk to the same Postgres schema (`001_init.sql` + `002_pos_integration.sql`),
so you can even run them side by side against one Supabase database and cut over
by flipping `VITE_API_BASE_URL` (and `EXPO_PUBLIC_API_BASE_URL` for mobile).

### Moving back to Render

Hidden helper files describe the rollback:

- `.render.env.example` — env vars the Fastify backend expects.
- `.render-restore.md` — step-by-step to restore the Render-based deployment.
- `.supabase.env.example` — env vars for the Supabase Edge Function.

Keep `backend/` compiling (`npm run typecheck`) so this path stays ready.
