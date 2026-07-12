import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { generateOpaqueToken } from '../../utils/ids.js';

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
    organizationName: 'Light Rail Deals',
    description: input.description ?? input.cardName,
    backgroundColor: 'rgb(30,30,30)',
    foregroundColor: 'rgb(255,255,255)',
    labelColor: 'rgb(255,255,255)',
    userInfo: {
      passId: input.passId,
    },
    generic: {
      primaryFields: [{ key: 'card', label: 'Card', value: input.cardName }],
    },
    barcodes: [
      {
        message: input.lookupToken,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
      },
    ],
  };
}

export function buildApplePassPackage(input: ApplePassInput) {
  const passJson = buildApplePassJson(input);
  const configured = Boolean(config.appleCertPath && existsSync(config.appleCertPath));

  if (!configured) {
    return {
      status: 501,
      message: 'Apple pass signing not configured',
      passJson,
    };
  }

  const cert = readFileSync(config.appleCertPath, 'utf8');
  return {
    status: 200,
    message: 'Signing path detected; unsigned pass metadata returned in this handoff',
    passJson,
    certificateLoaded: cert.length > 0,
  };
}

export function createApplePassPayload(cardName: string, description?: string | null) {
  return buildApplePassJson({
    passId: randomUUID(),
    serialNumber: generateOpaqueToken(12),
    lookupToken: generateOpaqueToken(18),
    authToken: generateOpaqueToken(18),
    cardName,
    description: description ?? null,
  });
}
