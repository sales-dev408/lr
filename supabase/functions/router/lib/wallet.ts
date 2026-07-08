import { config } from './config.ts';

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
    nfc: { message: input.lookupToken, encryptionPublicKey: 'stubbed-public-key' },
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
