# Mobile Customer App

Expo-managed React Native customer app for the Master Gift/Discount Card System.

## Run

```bash
npm install
npm run start
```

For web compilation checks:

```bash
npm run typecheck
npm run lint
npm run export:web
```

## Environment

- `EXPO_PUBLIC_API_BASE_URL` — backend base URL, default `http://localhost:4000/api`
  - On a physical device, point this at your machine's LAN IP.

## Native-only stubs

- Apple Wallet add
- Google Wallet add
- NFC tap / VAS
- Live camera QR scanning

Those flows are scaffolded with real API calls where possible, but the app does not fake native entitlements or device-only capabilities.
