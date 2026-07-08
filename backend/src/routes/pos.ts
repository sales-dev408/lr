import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { writeTransactionAudit } from '../services/audit.js';
import {
  connectVendorPosProvider,
  disconnectVendorPosProvider,
  finalizePosConnection,
  getPosConnectionByProvider,
  getPosConnectionSummary,
  syncConnectionDiscountsByProvider,
  type PosProvider,
} from '../services/pos.js';

const providerSchema = z.enum(['square', 'clover', 'toast', 'stripe']);

function portalRedirect(params: Record<string, string>): string {
  const url = new URL(config.vendorPortalUrl.replace(/\/$/, '') + '/pos-integration');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function registerPosRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/vendor/pos/connections', { preHandler: fastify.requireRole(['vendor']) }, async (request) => {
    return getPosConnectionSummary(request.user!.sub);
  });

  fastify.post('/api/vendor/pos/connections/:provider/connect', { preHandler: fastify.requireRole(['vendor']) }, async (request) => {
    const provider = providerSchema.parse((request.params as { provider: PosProvider }).provider);
    const result = await connectVendorPosProvider({ vendorId: request.user!.sub, provider });
    await writeTransactionAudit({
      actorType: 'vendor',
      actorId: request.user!.sub,
      action: `pos.${provider}.connect`,
      entityType: 'pos_connection',
      entityId: result.connection.id,
      metadata: { provider, mode: result.mode, status: result.connection.status },
      ip: request.ip,
    });

    if (result.authorizeUrl) {
      return {
        provider,
        mode: result.mode,
        status: result.connection.status,
        authorizeUrl: result.authorizeUrl,
        state: result.state,
        connection: result.connection,
        message: result.message,
      };
    }

    return {
      provider,
      mode: result.mode,
      status: result.connection.status,
      connection: result.connection,
      message: result.message,
    };
  });

  fastify.delete('/api/vendor/pos/connections/:provider', { preHandler: fastify.requireRole(['vendor']) }, async (request, reply) => {
    const provider = providerSchema.parse((request.params as { provider: PosProvider }).provider);
    const connection = await disconnectVendorPosProvider({ vendorId: request.user!.sub, provider });
    if (!connection) {
      return reply.code(404).send({ error: 'POS connection not found' });
    }
    await writeTransactionAudit({
      actorType: 'vendor',
      actorId: request.user!.sub,
      action: `pos.${provider}.disconnect`,
      entityType: 'pos_connection',
      entityId: connection.id,
      metadata: { provider, status: connection.status },
      ip: request.ip,
    });
    return connection;
  });

  fastify.post('/api/vendor/pos/connections/:provider/sync', { preHandler: fastify.requireRole(['vendor']) }, async (request, reply) => {
    const provider = providerSchema.parse((request.params as { provider: PosProvider }).provider);
    const connection = await getPosConnectionByProvider(request.user!.sub, provider);
    if (!connection || connection.status !== 'connected') {
      return reply.code(404).send({ error: 'POS connection not found or not connected' });
    }
    const results = await syncConnectionDiscountsByProvider({ vendorId: request.user!.sub, provider });
    await writeTransactionAudit({
      actorType: 'vendor',
      actorId: request.user!.sub,
      action: `pos.${provider}.sync`,
      entityType: 'pos_connection',
      entityId: connection.id,
      metadata: { provider, synced: results.length },
      ip: request.ip,
    });
    return {
      provider,
      synced: results.length,
      results,
      status: connection.status,
    };
  });

  fastify.get('/api/pos/oauth/callback', async (request, reply) => {
    const query = z.object({
      state: z.string().min(1),
      code: z.string().optional(),
      error: z.string().optional(),
      error_description: z.string().optional(),
    }).parse(request.query);

    if (query.error) {
      return reply.redirect(portalRedirect({
        pos: 'error',
        message: query.error_description ?? query.error,
      }));
    }

    if (!query.code) {
      return reply.redirect(portalRedirect({ pos: 'error', message: 'Missing authorization code' }));
    }

    try {
      const result = await finalizePosConnection({ stateToken: query.state, code: query.code });
      await writeTransactionAudit({
        actorType: 'vendor',
        actorId: result.vendorId,
        action: `pos.${result.provider}.callback`,
        entityType: 'pos_connection',
        entityId: result.connection.id,
        metadata: { provider: result.provider, mode: result.mode, status: result.connection.status },
        ip: request.ip,
      });
      return reply.redirect(portalRedirect({
        pos: 'connected',
        provider: result.provider,
        mode: result.mode,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'POS callback failed';
      return reply.redirect(portalRedirect({
        pos: 'error',
        message,
      }));
    }
  });
}
