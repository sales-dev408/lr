# Frontend Flow Descriptions

Three frontends talk to the same backend REST API. Auth is JWT stored per app
(admin/vendor in web storage, customer in secure device storage).

## 1. Admin Dashboard (Platform Owner) — React + Vite

Role-based access (`owner`, `admin`, `analyst`). Analyst is read-only on
management screens.

- **Login** → `/auth/admin/login` (CAPTCHA-gated). JWT stored; role gates routes.
- **Overview / Analytics** — headline KPIs (redemptions, unique customers,
  active cards/vendors), 30-day time chart, top-performing businesses, filters
  (date range, city). Source: `GET /admin/analytics`.
- **Vendors** — table with filters (status/city/category). Actions:
  create, edit, **approve/reject**, **reset password**, view **activity log**.
  Sources: `/admin/vendors*`.
- **Master Cards** — list/create/edit cards: theme (sports / entertainment /
  shops_restaurants), description, **global rules** (expiration, max uses),
  status. Manage **participating businesses** (add/remove vendors) and
  **per-business discount config** (type fixed/%/BOGO, value, limits, city
  overrides). Sources: `/admin/cards*`, `/admin/discounts*`.
- **Audit** — searchable view of `transactions` (who did what, when).

Flow example — launch a new card: create card → set theme + global rules →
add participating vendors → configure each vendor's discount → set status
`active` → customers now see it in `GET /cards`.

## 2. Vendor Portal — React + Vite

- **Login / self-register** — `/auth/vendor/login`, `/vendor/register`
  (new vendors land in `pending` until an admin approves).
- **My Cards** — cards the vendor participates in (`GET /vendor/cards`).
- **Edit discount** — edit only allowed fields (value, min purchase,
  per-customer limit, active toggle, city overrides) via
  `PATCH /vendor/discounts/:id`. Type/global rules are read-only (owner-controlled).
- **Analytics** — daily / weekly / monthly redemptions, unique-customer
  insights (anonymous, no PII), per-card breakdown (`GET /vendor/analytics`).
- **Redeem console** — universal flow: scan the customer's QR or enter the
  discount/lookup ID → `GET /lookup/...` shows customer + eligible discount →
  enter purchase amount → `POST /redeem` returns validity + amount →
  **cashier applies the discount manually** at the register.
- **POS instructions** — per-provider setup pages: Square, Stripe, Clover,
  Toast (see `pos-integration-guide.md`).

## 3. Customer Mobile App — Expo React Native (iOS + Android)

- **Onboarding via poster QR** — scanning a business poster opens the app store;
  first launch reads the deep link `lrcard://onboard?code=…`, calls
  `GET /onboarding/:code`, and **auto-selects the theme + business**.
- **Sign up / log in** — email / phone / social (`/auth/register`,
  `/auth/social`), CAPTCHA-gated.
- **Select card themes** — pick sports / entertainment / shops_restaurants.
- **Browse** — participating businesses + their discounts (`GET /cards?theme=&city=`),
  location-aware via device city.
- **Add to wallet** — `POST /passes {cardId, platform}` → Add to Apple Wallet
  (`.pkpass`) or Google Wallet (save link). Pass carries the `lookup_token` in
  its QR barcode and Apple VAS NFC block.
- **In-store use** — show the wallet pass QR, **tap NFC** (Apple VAS), or read a
  manual code to the cashier.
- **Pass updates** — when a discount changes, an APNs/Google push refreshes the
  wallet pass automatically.

Flow example — first-time customer from a poster: scan poster → install app →
app auto-selects "Shops & Restaurants" + that café → sign up → add pass to
Apple Wallet → tap phone at register next visit → cashier applies 15% off.
