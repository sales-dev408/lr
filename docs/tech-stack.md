# Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Backend runtime** | Node.js 20 (LTS) | Requirement; broad ecosystem. |
| **Web framework** | Fastify v4 (TypeScript) | Fast, schema-first, first-class plugins for security/rate-limit. (Express is an acceptable alternative.) |
| **Database** | PostgreSQL 15+ | Requirement; strong transactional guarantees, `FOR UPDATE` row locks, `jsonb`, `citext`. |
| **DB access** | `pg` (node-postgres) + raw SQL migrations | Explicit control over locking/transactions; no ORM magic on the critical redemption path. |
| **Validation** | Zod | Runtime request validation + inferred TS types. |
| **Auth** | JWT (`jsonwebtoken`) + bcrypt | Stateless, horizontally scalable. No MFA (by spec). |
| **Security** | `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, provider-agnostic CAPTCHA | Edge hardening + anti-bot. |
| **QR** | `qrcode` | PNG generation for onboarding + pass barcodes. |
| **Apple Wallet** | PassKit `.pkpass` (cert-signed) + APNs | Native wallet + push updates. Signing/push guarded behind configured certs. |
| **Google Wallet** | Google Wallet API generic pass (JWT save links via `google-auth-library`) | Android wallet. |
| **Logging** | pino (Fastify default) | Structured logs. |
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
  backend/          Fastify + PostgreSQL API (deepest component)
  admin-dashboard/  React + Vite (platform owner)
  vendor-portal/    React + Vite (vendors)
  mobile/           Expo React Native (customers, iOS + Android)
  docs/             Architecture, data model, API spec, flows, POS guide,
                    security/scalability, tech stack, NFC/QR flows
```
