import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { verifyJwt } from '../services/jwt.js';
import type { Role, JwtClaims } from '../types.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: Role[]) => (request: import('fastify').FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user?: JwtClaims;
  }
}

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorate('authenticate', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      request.user = verifyJwt(token);
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.decorate('requireRole', (roles: Role[]) => async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    if (!request.user || !roles.includes(request.user.role)) {
      reply.code(403).send({ error: 'Forbidden' });
    }
  });
}

export default fp(authPlugin);
