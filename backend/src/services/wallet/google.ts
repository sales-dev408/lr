import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { generateOpaqueToken } from '../../utils/ids.js';

export function buildGoogleWalletLink(input: {
  passId: string;
  serialNumber: string;
  lookupToken: string;
  cardName: string;
}) {
  if (!config.googleWalletIssuerId || !config.googleWalletServiceAccountJson) {
    return {
      configured: false,
      message: 'Google Wallet not configured',
    };
  }

  const serviceAccount = JSON.parse(config.googleWalletServiceAccountJson) as {
    client_email: string;
    private_key: string;
  };

  const payload = {
    iss: serviceAccount.client_email,
    aud: 'google',
    origins: [config.playStoreUrl],
    typ: 'savetowallet',
    payload: {
      genericClasses: [
        {
          id: `${config.googleWalletIssuerId}.master_card`,
          issuerName: 'Master Gift/Discount Card System',
        },
      ],
      genericObjects: [
        {
          id: `${config.googleWalletIssuerId}.${input.passId}.${input.serialNumber}`,
          classId: `${config.googleWalletIssuerId}.master_card`,
          state: 'ACTIVE',
          cardName: input.cardName,
          heroImage: {
            sourceUri: {
              uri: config.playStoreUrl,
            },
          },
          barcode: {
            type: 'QR_CODE',
            value: input.lookupToken,
          },
        },
      ],
    },
  };

  const saveJwt = jwt.sign(payload, serviceAccount.private_key, {
    algorithm: 'RS256',
  });

  return {
    configured: true,
    jwt: saveJwt,
    saveUrl: `https://pay.google.com/gp/v/save/${saveJwt}`,
  };
}

export function createGoogleWalletStub() {
  return buildGoogleWalletLink({
    passId: generateOpaqueToken(12),
    serialNumber: generateOpaqueToken(10),
    lookupToken: generateOpaqueToken(18),
    cardName: 'Master Card',
  });
}
