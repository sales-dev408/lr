# Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Backend runtime** | Supabase Edge Functions (Deno) | Keeps the backend and database on Supabase while preserving the HTTP API contract. |
| **Web framework** | Route dispatcher in Edge Function | Minimal routing layer; the current `/api/*` contract stays intact. |
| **Database** | Supabase Postgres | Managed PostgreSQL with transactional guarantees, `jsonb`, `citext`. |
| **DB access** | Supabase client / RPC | HTTP-only access from Edge Functions; use RPCs for transactional flows. |
| **Validation** | Zod | Runtime request validation + inferred TS types. |
| **Auth** | JWT + bcrypt-compatible hashing | Stateless, horizontally scalable. No MFA (by spec). |
| **Security** | Supabase auth/session checks + provider-agnostic CAPTCHA | Edge hardening + anti-bot. |
| **QR** | `qrcode` | PNG generation for onboarding + pass barcodes. |
| **Apple Wallet** | PassKit `.pkpass` (cert-signed) + APNs | Native wallet + push updates. Signing/push guarded behind configured certs. |
| **Google Wallet** | Google Wallet API generic pass (JWT save links via `google-auth-library`) | Android wallet. |
| **Logging** | Supabase function logs | Structured logs. |
| **Admin dashboard** | React + Vite + TypeScript | Fast SPA build; role-based UI. |
| **Vendor portal** | React + Vite + TypeScript | Shares patterns/components with admin. |
| **Mobile app** | Expo (React Native) + TypeScript | Single codebase for iOS + Android; wallet + camera/NFC modules; requirement allows RN or Flutter. |
| **Monorepo** | npm workspaces | Simple, no extra tooling; `backend` + web apps share the root. |
| **Testing** | Vitest / node:test | Unit tests for redemption math + rule resolution; DB tests gated on `DATABASE_URL`. |
| **Lint/format** | ESLint (`@typescript-eslint`) + Prettier | Consistency. |

## Production add-ons (recommended, not in scaffold)
- **PgBouncer / connection pooling**, **read replicas** for analytics.
- **Redis** for shared rate-limit counters + hot-read cache.
- **Job queue** (BullMQ/SQS) for async APNs / Google Wallet push fan-out.
- **CDN + WAF** in front of the API and static SPA bundles.
- **Secret manager** (AWS Secrets Manager / Vault) instead of `.env`.
- **CI/CD** (typecheck + lint + test + build), containerized deploy.
- **Observability**: metrics (Prometheus/OpenTelemetry) + tracing + alerting.

## Repository layout
```
lr/
  backend/          Legacy Fastify reference; deployment target is Supabase
  admin-dashboard/  React + Vite (platform owner)
  vendor-portal/    React + Vite (vendors)
  mobile/           Expo React Native (customers, iOS + Android)
  docs/             Architecture, data model, API spec, flows, POS guide,
                    security/scalability, tech stack, NFC/QR flows
```
