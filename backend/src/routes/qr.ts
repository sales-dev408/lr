import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { Buffer } from 'node:buffer';
import { config } from '../config.js';
import { dbQuery } from '../db/pool.js';

function onboardingCode(vendorId: string, cardId: string): string {
  return Buffer.from(JSON.stringify({ vendorId, cardId }), 'utf8').toString('base64url');
}

function decodeOnboardingCode(code: string): { vendorId: string; cardId: string } | null {
  try {
    const decoded = Buffer.from(code, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { vendorId?: string; cardId?: string };
    if (!parsed.vendorId || !parsed.cardId) {
      return null;
    }
    return { vendorId: parsed.vendorId, cardId: parsed.cardId };
  } catch {
    return null;
  }
}

export async function registerQrRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/onboarding/:code', async (request, reply) => {
    const code = (request.params as { code: string }).code;
    const decoded = decodeOnboardingCode(code);
    if (!decoded) {
      return reply.code(404).send({ error: 'Invalid onboarding code' });
    }

    const rows = await dbQuery(
      `
        SELECT c.id AS card_id, c.theme, c.name AS card_name,
               v.id AS vendor_id, v.name AS vendor_name
        FROM cards c
        JOIN vendors v ON v.id = $1
        WHERE c.id = $2
        LIMIT 1
      `,
      [decoded.vendorId, decoded.cardId],
    );

    if (rows.length === 0) {
      return reply.code(404).send({ error: 'Not found' });
    }

    return {
      theme: rows[0]!.theme,
      card: rows[0]!.card_name,
      vendor: rows[0]!.vendor_name,
      appStoreUrl: config.appStoreUrl,
      playStoreUrl: config.playStoreUrl,
    };
  });

  fastify.get('/api/qr/onboarding.png', async (request, reply) => {
    const query = request.query as { vendorId?: string; cardId?: string };
    if (!query.vendorId || !query.cardId) {
      return reply.code(400).send({ error: 'vendorId and cardId are required' });
    }
    const code = onboardingCode(query.vendorId, query.cardId);
    const deepLink = `lrcard://onboard?code=${encodeURIComponent(code)}`;
    const image = await QRCode.toBuffer(`${deepLink}\nhttps://example.invalid/onboard?code=${encodeURIComponent(code)}`, { type: 'png' });
    reply.type('image/png').send(image);
  });

  fastify.get('/api/qr/lookup/:lookupToken.png', async (request, reply) => {
    const lookupToken = (request.params as { lookupToken: string }).lookupToken;
    const image = await QRCode.toBuffer(lookupToken, { type: 'png' });
    reply.type('image/png').send(image);
  });
}
