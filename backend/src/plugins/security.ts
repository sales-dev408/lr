import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';

function isAuthOrRedeemPath(request: FastifyRequest): boolean {
  return request.url.startsWith('/api/auth') || request.url.startsWith('/api/redeem');
}

async function securityPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(helmet);
  await fastify.register(cors, {
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : true,
    credentials: true,
  });
  await fastify.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
  });

  fastify.addHook('preHandler', async (request, reply) => {
    const ua = request.headers['user-agent'];
    if (config.blockedIps.includes(request.ip)) {
      reply.code(403).send({ error: 'Forbidden' });
      return;
    }

    if (isAuthOrRedeemPath(request) && (!ua || ua.trim().length === 0)) {
      reply.code(400).send({ error: 'User-Agent required' });
      return;
    }

    const paramCount = Object.keys(request.params ?? {}).length + Object.keys(request.query ?? {}).length;
    if (paramCount > 25) {
      reply.code(400).send({ error: 'Too many parameters' });
      return;
    }
  });
}

export default fp(securityPlugin);
