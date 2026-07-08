# Architecture — Master Gift/Discount Card System

A multi-business platform where a platform owner issues **Master Cards** (themed
discount cards) that bundle many participating businesses (vendors). Customers
add a card to Apple/Google Wallet and redeem discounts in-store via QR / NFC /
manual code. Vendors manage their own discount fields and see analytics. The
platform owner administers everything.

## Component overview (text diagram)

```
                             ┌───────────────────────────────────────────┐
                             │              CLIENTS                        │
                             │                                             │
   ┌───────────────┐  HTTPS  │  ┌────────────────┐   ┌────────────────┐   │
   │ Admin          │◀───────┼─▶│ Admin Dashboard │   │ Vendor Portal  │   │
   │ (Platform Owner)│        │  │  React + Vite   │   │  React + Vite  │   │
   └───────────────┘         │  └────────────────┘   └────────────────┘   │
                             │           │                    │           │
   ┌───────────────┐         │  ┌────────────────────────────────────┐    │
   │ Customer       │◀───────┼─▶│ Customer Mobile App (Expo RN)       │    │
   │ (phone)        │  HTTPS  │  │  iOS + Android                      │    │
   └───────────────┘         │  └────────────────────────────────────┘    │
                             └───────────────────┬─────────────────────────┘
                                                 │  REST/JSON over TLS
                                                 ▼
        ┌────────────────────────────────────────────────────────────────┐
        │                 SUPABASE EDGE FUNCTIONS                          │
        │                                                                  │
        │  Security edge:  helmet · CORS · rate-limit · bad-traffic block  │
        │                  · CAPTCHA verify · audit logging                │
        │                                                                  │
        │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐   │
        │  │ Auth     │ │ Cards /  │ │ Redeem / │ │ Analytics         │   │
        │  │ (JWT)    │ │ Discounts│ │ Lookup   │ │ (admin + vendor)  │   │
        │  └──────────┘ └──────────┘ └────┬─────┘ └───────────────────┘   │
        │  ┌──────────┐ ┌──────────┐      │ FOR UPDATE row locks          │
        │  │ Vendor   │ │ QR       │ ┌────▼──────┐ ┌───────────────────┐   │
        │  │ mgmt     │ │ onboard  │ │ Wallet     │ │ APNs push (stub)  │   │
        │  └──────────┘ └──────────┘ │ PassKit +  │ └───────────────────┘   │
        │                            │ Google     │                        │
        │                            └────────────┘                        │
        └───────────────────────────────┬──────────────────────────────────┘
                                         │  pg (TLS / encrypted tunnel)
                                         ▼
                          ┌───────────────────────────────┐
                          │        PostgreSQL              │
                          │  users vendors admins cards    │
                          │  card_vendors discounts passes │
                          │  gift_cards redemptions        │
                          │  transactions (audit)          │
                          └───────────────────────────────┘

     External integrations:
       Apple PassKit (.pkpass signing) + APNs   Google Wallet (JWT save links)
       CAPTCHA provider (reCAPTCHA/hCaptcha/Turnstile)   Social login providers
       POS / vendor tablet → /api/redeem (simple REST, cashier applies manually)
```

## Request flows (high level)

**Onboarding via poster QR:** poster QR → app store → app opens with
`?code=` deep link → `GET /api/onboarding/:code` returns theme + business → app
pre-selects them → customer signs up → adds pass to wallet.

**Add to wallet:** app calls `POST /api/passes {cardId, platform}` → backend
mints `serial_number`, `lookup_token`, `auth_token` → returns `.pkpass`
(Apple, if certs configured) or Google Wallet save link. Pass barcode/NFC
carries `lookup_token`.

**In-store redemption:** customer shows QR / taps NFC / reads code → vendor
tablet or POS calls `POST /api/redeem` with the token + vendor + optional
purchase amount → backend locks the discount row `FOR UPDATE`, validates all
rules (expiry, global/per-customer caps, city variations), records the
redemption + audit row, returns discount validity + amount → **cashier applies
the discount manually**.

**Pass updates:** admin/vendor changes a discount → backend updates the pass and
sends an APNs push (stub until Apple key configured) → wallet re-fetches
`GET /api/passes/:serial`.

## Deployment topology (recommended)

```
        Internet
           │  TLS
     ┌─────▼─────┐      ┌──────────────┐
     │  CDN /    │      │ Load Balancer │
     │  WAF      │─────▶│  (TLS term)   │
     └───────────┘      └──────┬────────┘
                               │
                   ┌───────────┴───────────┐
                   │  Backend (N replicas)  │  stateless, JWT
                   └───────────┬───────────┘
                               │ TLS / private subnet / SSH or WireGuard tunnel
                   ┌───────────▼───────────┐
                   │  PostgreSQL (primary   │
                   │  + read replicas)      │
                   └────────────────────────┘
   Static hosting: admin-dashboard & vendor-portal as static SPA bundles (S3/CDN).
   Mobile app: distributed via App Store / Play Store.
```

See `data-model.md`, `api-spec.md`, `frontend-flows.md`, `pos-integration-guide.md`,
`nfc-qr-flows.md`, `security-scalability.md`, and `tech-stack.md` for details.
