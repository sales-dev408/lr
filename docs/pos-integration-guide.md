# POS Integration Guide (Non-Technical)

This system is intentionally **POS-agnostic**. It does **not** plug deeply into
your point-of-sale software. Instead, the cashier applies the discount by hand
after the system confirms it is valid. This works with **any** register — Square,
Stripe, Clover, Toast, or even a paper receipt.

## The universal flow (every POS)

1. The customer **taps their phone (NFC)** or **shows a QR code** (from Apple/
   Google Wallet), or reads out a **discount code**.
2. The cashier uses the **Vendor Portal "Redeem" screen** on a tablet or phone
   to scan the QR / enter the code.
3. The system checks the discount is valid (not expired, within limits, correct
   business/city) and shows the discount — e.g. **"15% off — apply $6.30"**.
4. The cashier **applies that discount manually** in their normal POS (using the
   POS's built-in discount/comp button) and completes the sale as usual.

That's it. No POS plugin, no menu changes, no certification.

```
Customer taps NFC / shows QR  ─▶  Vendor tablet scans  ─▶  Backend validates
        │                                                        │
        └──────────────  "15% off, apply $6.30"  ◀───────────────┘
                                   │
                        Cashier presses the POS
                        discount button manually
```

## Per-provider notes (where to press "discount")

The Vendor Portal has a dedicated instructions page for each of these. Summary:

- **Square** — Register/Point of Sale app → in the cart, tap the item or
  **"Add discount"** → choose **"Amount"** or **"Percentage"** → enter the value
  the system showed → charge.
- **Stripe** (Terminal / Payment Links / Dashboard) — apply a **coupon /
  discount** to the invoice or subtract the amount before taking payment on the
  Terminal.
- **Clover** — in the order, tap **"Discount"** → select a preset or enter a
  custom **% or $** discount → matches the amount shown → pay.
- **Toast** — on the check, tap **"Discount"** → pick a discount or add a custom
  one for the shown amount → close the check.

## Optional: connect a POS/tablet directly to the API

If you want your own tablet app or POS integration to call the system instead of
using the Vendor Portal, it only needs **two REST calls** (see `api-spec.md`):

1. `GET /api/lookup/:lookupToken` (or `/api/lookup/card/:cardId`) — show the
   customer + eligible discount.
2. `POST /api/redeem` — confirm and record the redemption; the response tells you
   the exact amount to apply.

Authenticate with the vendor's API token. No other endpoints are required.

## What the system does and does NOT do

- **Does:** validate eligibility, enforce usage limits safely (even under
  simultaneous scans), record every redemption for analytics + audit, vary rules
  by city.
- **Does NOT:** capture payment, modify your prices/tax, or require any change to
  your existing POS configuration. The final discount is always applied by the
  cashier.
