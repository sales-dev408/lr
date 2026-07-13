import { config } from './config.ts';
import type { AddpassPayload } from './addpass.ts';
import { humanDiscountLabel, type DiscountType } from './codes.ts';

export interface DiscountCardForWallet {
  id: string;
  name: string;
  discountType: DiscountType;
  discountValue: number;
  discountCode: string;
  iconUrl?: string | null;
  logoUrl?: string | null;
}

// Builds the AddPass payload for a discount tier. The barcode message and the
// visible "Code" field are intentionally identical so a cashier can either scan
// the barcode or key in the exact same code shown on the pass.
export function buildAddpassPayload(card: DiscountCardForWallet): AddpassPayload {
  const label = card.name || humanDiscountLabel(card.discountType, card.discountValue);
  return {
    primaryText: label,
    logoText: config.brandName,
    backgroundColor: config.walletBackgroundColor,
    foregroundColor: config.walletForegroundColor,
    labelColor: config.walletLabelColor,
    headerLabelRight: 'Discount',
    headerTextRight: label.slice(0, 12),
    secondaryLabelLeft: 'Code',
    secondaryTextLeft: card.discountCode,
    barcode: { format: 'qr', message: card.discountCode, messageEncoding: 'iso-8859-1' },
    backfields: [
      { label: 'How to redeem', value: 'Show this barcode at checkout, or give the cashier the code above.' },
      { label: 'Discount', value: label },
      { label: 'Powered by', value: config.brandName },
    ],
    serialNumber: card.discountCode,
    ...(card.iconUrl ? { thumbnailURL: card.iconUrl } : {}),
    ...(card.logoUrl ? { customLogoURL: card.logoUrl } : {}),
  };
}

// Stable backend URL that streams the .pkpass for a discount tier.
export function buildPkpassDownloadUrl(baseUrl: string, cardId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/passes/card/${cardId}/pkpass`;
}

// A ready-to-paste "Add to Apple Wallet" embed snippet for a merchant website.
export function buildWalletEmbedHtml(pkpassUrl: string, label: string): string {
  return [
    '<a href="' + pkpassUrl + '" ',
    'style="display:inline-block;padding:10px 18px;border-radius:10px;background:#000;color:#fff;',
    'font-family:-apple-system,Helvetica,Arial,sans-serif;text-decoration:none;font-weight:600;">',
    '\uF8FF&nbsp;Add ' + label + ' to Apple Wallet</a>',
  ].join('');
}

export interface ApplePassInput {
  passId: string;
  serialNumber: string;
  lookupToken: string;
  authToken: string;
  cardName: string;
  description?: string | null;
  theme?: string;
}

export function buildApplePassJson(input: ApplePassInput) {
  return {
    formatVersion: 1,
    passTypeIdentifier: config.applePassTypeId || 'pass.com.example.mastercard',
    serialNumber: input.serialNumber,
    teamIdentifier: config.appleTeamId || 'TEAMID',
    organizationName: 'Master Gift/Discount Card System',
    description: input.description ?? input.cardName,
    backgroundColor: 'rgb(30,30,30)',
    foregroundColor: 'rgb(255,255,255)',
    labelColor: 'rgb(255,255,255)',
    userInfo: { passId: input.passId },
    generic: { primaryFields: [{ key: 'card', label: 'Card', value: input.cardName }] },
    barcodes: [{ message: input.lookupToken, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' }],
  };
}

export function buildApplePassPackage(input: ApplePassInput) {
  const passJson = buildApplePassJson(input);
  return {
    status: config.appleCertPath ? 200 : 501,
    message: config.appleCertPath ? 'Signing path detected; unsigned pass metadata returned in this handoff' : 'Apple pass signing not configured',
    passJson,
  };
}

export function buildGoogleWalletLink(input: { passId: string; serialNumber: string; lookupToken: string; cardName: string }) {
  if (!config.googleWalletIssuerId || !config.googleWalletServiceAccountJson) {
    return { configured: false, message: 'Google Wallet not configured' };
  }
  return {
    configured: true,
    jwt: 'stubbed-google-wallet-jwt',
    saveUrl: 'https://pay.google.com/gp/v/save/stubbed-google-wallet-jwt',
  };
}
