# Security & Scalability Notes

## Security

### Transport & data
- **TLS everywhere.** Clients ↔ backend over HTTPS. Backend ↔ PostgreSQL over
  TLS / an encrypted tunnel (`PGSSLMODE=require`, or WireGuard/SSH tunnel to a
  private DB). Never expose Postgres publicly.
- **Secrets** via environment / secret manager (`.env` git-ignored;
  `.env.example` documents keys). No secrets in code or logs.
- **Password hashing** with bcrypt. Tokens are opaque randoms; `lookup_token`
  and `auth_token` are per-pass and single-purpose.

### AuthN / AuthZ
- **JWT** with `role` claim (`admin`/`vendor`/`customer`) + subject id;
  short-lived, verified on every protected route via role guards.
- Admin dashboard has sub-roles (`owner`/`admin`/`analyst`) for least privilege.
- Vendors can edit **only** their own discount's allowed fields (ownership
  checks server-side, never trusting client-supplied vendor ids).
- **No MFA** (per product requirement) — compensated by CAPTCHA, rate limiting,
  bad-traffic filtering, and full audit logging.

### Edge protection ("block illegal traffic")
- `@fastify/helmet` (secure headers), `@fastify/cors` (allow-listed origins).
- `@fastify/rate-limit`: global cap + stricter limits on `/auth/*` and
  `/redeem`.
- Bad-traffic preHandler: rejects empty/known-bad user agents on auth, oversized
  bodies, absurd query/param counts, and an env-driven IP denylist. Sits behind
  a WAF/CDN in production.
- **Anti-bot CAPTCHA** (provider-agnostic: reCAPTCHA / hCaptcha / Turnstile) on
  register + all login routes; no-ops in dev when unconfigured.

### Abuse-safe redemption
- Redemption runs in a transaction with `SELECT … FOR UPDATE` on the discount
  (and gift-card) row, so concurrent scans cannot exceed usage caps or oversell
  a balance.
- Both approved and **denied** attempts are written to `redemptions` +
  `transactions`, giving a complete audit trail and anomaly signal.
- Opaque, rule-limited `lookup_token`s mean a leaked pass QR risks only a
  bounded discount, not account takeover.

### City-based rule variations
`discounts.city_overrides` (jsonb) lets the same discount resolve differently by
city; resolution happens server-side in lookup/redeem via `applyCityRules`.

### Privacy
Vendor analytics expose **aggregate, anonymous** customer insights only (counts,
uniques) — never PII. `transactions` records actor + action for accountability.

## Scalability

- **Stateless backend** (JWT, no server sessions) → scale horizontally behind a
  load balancer; run N replicas.
- **PostgreSQL**: primary for writes; **read replicas** for analytics-heavy
  reads. Connection pooling (pg Pool / PgBouncer). Proper indexes on hot paths
  (`redemptions(vendor_id, redeemed_at)`, unique `lookup_token`/`serial_number`).
- **Row-level locks are per-discount**, so contention is localized; unrelated
  discounts redeem concurrently without blocking each other.
- **Analytics** can move to materialized views / a rollup table (or a warehouse)
  as volume grows, refreshed on a schedule, to keep OLTP fast.
- **Caching**: CDN for static SPA bundles + QR/onboarding images; optional Redis
  for hot card/discount reads and rate-limit counters (shared across replicas).
- **Wallet push fan-out** (APNs / Google) is async — enqueue on a job queue so
  discount edits don't block request threads.
- **QR/pass generation** is CPU-light and cacheable; heavy signing can move to a
  worker.
- **Observability**: structured (pino) logs, health checks (`/api/health`
  reports DB reachability), metrics + tracing recommended for production.

## Threats considered
Credential stuffing (rate-limit + CAPTCHA), replay of redemption tokens
(server-side single-flow validation + audit), oversell under concurrency (row
locks), privilege escalation (role guards + ownership checks), data exfiltration
(TLS + least-privilege DB + no PII in vendor analytics).
