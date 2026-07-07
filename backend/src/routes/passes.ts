import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery } from '../db/pool.js';
import { generateOpaqueToken } from '../utils/ids.js';
import { buildApplePassPackage } from '../services/wallet/apple.js';
import { buildGoogleWalletLink } from '../services/wallet/google.js';

const createPassSchema = z.object({
  cardId: z.string().uuid(),
  platform: z.enum(['apple', 'google']),
});

export async function registerPassRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/passes', { preHandler: fastify.requireRole(['customer']) }, async (request, reply) => {
    const body = createPassSchema.parse(request.body);
    const serialNumber = generateOpaqueToken(12);
    const lookupToken = generateOpaqueToken(18);
    const authToken = generateOpaqueToken(18);

    const rows = await dbQuery<{ id: string; serial_number: string }>(
      `
        INSERT INTO passes (user_id, card_id, platform, serial_number, auth_token, lookup_token)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, serial_number
      `,
      [request.user!.sub, body.cardId, body.platform, serialNumber, authToken, lookupToken],
    );

    const card = await dbQuery<{ name: string; description: string | null }>('SELECT name, description FROM cards WHERE id = $1 LIMIT 1', [body.cardId]);
    const passMetadata = {
      passId: rows[0]!.id,
      serialNumber,
      lookupToken,
      authToken,
      cardName: card[0]?.name ?? 'Master Card',
      description: card[0]?.description ?? null,
    };

    const wallet =
      body.platform === 'apple'
        ? buildApplePassPackage(passMetadata)
        : buildGoogleWalletLink({
            passId: passMetadata.passId,
            serialNumber: passMetadata.serialNumber,
            lookupToken: passMetadata.lookupToken,
            cardName: passMetadata.cardName,
          });

    return reply.code(201).send({
      pass: passMetadata,
      wallet,
      downloadUrl: `/api/passes/${rows[0]!.serial_number}`,
    });
  });

  fastify.get('/api/passes/:serial', async (request, reply) => {
    const serial = (request.params as { serial: string }).serial;
    const rows = await dbQuery(
      `
        SELECT p.*, c.name AS card_name, c.description AS card_description
        FROM passes p
        JOIN cards c ON c.id = p.card_id
        WHERE p.serial_number = $1
        LIMIT 1
      `,
      [serial],
    );
    if (rows.length === 0) {
      return reply.code(404).send({ error: 'Pass not found' });
    }

    return rows[0];
  });

  fastify.post('/api/passes/:serial/registrations/:deviceLibraryId', async (request) => {
    const params = request.params as { serial: string; deviceLibraryId: string };
    const body = z.object({ pushToken: z.string().optional() }).parse(request.body ?? {});
    await dbQuery(
      'UPDATE passes SET device_library_id = $2, push_token = COALESCE($3, push_token), updated_at = now() WHERE serial_number = $1',
      [params.serial, params.deviceLibraryId, body.pushToken ?? null],
    );
    return { registered: true };
  });

  fastify.delete('/api/passes/:serial/registrations/:deviceLibraryId', async (request) => {
    const params = request.params as { serial: string; deviceLibraryId: string };
    await dbQuery(
      'UPDATE passes SET device_library_id = NULL, push_token = NULL, updated_at = now() WHERE serial_number = $1 AND device_library_id = $2',
      [params.serial, params.deviceLibraryId],
    );
    return { deleted: true };
  });
}
