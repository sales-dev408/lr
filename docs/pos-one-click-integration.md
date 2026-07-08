# One-Click POS Integration

Vendors should only set up discounts — never operate a scan screen. This feature
lets a vendor connect their POS **once**; our Master Card discounts then sync
into that POS as **native discounts**, and redemption happens through the POS's
own flow. The vendor-portal Redeem console remains only as an optional manual
fallback.

## Model

```
Vendor clicks "Connect Square"  ──▶  OAuth (merchant authorizes)
        │                                     │
        ▼                                     ▼
  pos_connections row  ◀────  /api/pos/oauth/callback (signed state → vendor)
        │  tokens encrypted at rest (AES-256-GCM)
        ▼
Discount created/edited (admin or vendor)
        │  best-effort auto-sync (never blocks the discount write)
        ▼
POS adapter.upsertDiscount() ──▶ native discount in the POS  (mapping + sync log)
        ▼
In store: customer identified via the POS's own tap/loyalty ──▶ discount applied
          by the POS. No scanning in our portal.
```

## Adapter interface

Each provider implements one interface (`src/services/pos.ts`), and a registry
maps provider → adapter:

- `getAuthorizeUrl(state, redirectUrl)` — OAuth start.
- `exchangeCode(code, state)` — → `{ merchantId, locationId, accessToken, refreshToken, expiresAt, scope }`.
- `upsertDiscount(connection, discount, externalDiscountId?)` — → external id.
- `removeDiscount(connection, discount, externalDiscountId)`.
- `listLocations(connection)`.

## Provider support

| Provider | OAuth + token exchange | Discount sync | Status |
|---|---|---|---|
| **Square** | Real (Square OAuth + `/v2/catalog/object` DISCOUNT) | Real | Gated behind `SQUARE_APP_ID/SECRET/ENV/REDIRECT`; runs in **simulation** when unset |
| Clover | Interface implemented | Simulated | Real OAuth/catalog TODO, gated behind `CLOVER_*` |
| Toast | Interface implemented | Simulated | Real API TODO, gated behind `TOAST_*` |
| Stripe | Interface implemented | Simulated (coupons) | Real API TODO, gated behind `STRIPE_*` |

**Simulation mode** completes a connection and records deterministic fake
external ids so the whole connect → auto-sync flow is demonstrable end-to-end
without real merchant credentials. Responses/`pos_connections.mode` mark
`real` vs `simulated` explicitly.

## Security

- Access/refresh tokens are encrypted at rest with AES-256-GCM (`POS_TOKEN_ENC_KEY`);
  plaintext tokens are never logged.
- The OAuth callback validates a **signed `state`** param binding the redirect to
  the initiating vendor.
- POS sync failures are caught, logged to `pos_sync_log`, and mark the connection
  `status = error` — they never roll back or block the discount edit.

## Endpoints (vendor-authenticated unless noted)

- `GET /api/vendor/pos/connections` — connection status per provider.
- `POST /api/vendor/pos/connections/:provider/connect` — returns an `authorizeUrl`
  (real) or completes a simulated connection.
- `DELETE /api/vendor/pos/connections/:provider` — disconnect.
- `POST /api/vendor/pos/connections/:provider/sync` — manual re-sync of all the
  vendor's discounts.
- `GET /api/pos/oauth/callback` — public OAuth redirect target.

## What still needs the vendor/merchant

Real auto-apply-at-tap depends on each POS's capabilities and requires that
merchant's OAuth authorization. Square is wired end-to-end once you supply a
Square developer app's credentials; the other providers need their respective
API integrations completed behind the config keys above. See
`pos-integration-guide.md` for the manual universal fallback.
