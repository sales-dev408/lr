import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool.js';

export async function registerHealthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/health', async () => {
    const pool = getPool();
    let db = false;

    if (pool) {
      try {
        await pool.query('SELECT 1');
        db = true;
      } catch {
        db = false;
      }
    }

    return { status: 'ok', db };
  });

  fastify.get('/', async () => ({
    name: 'Light Rail Deals Backend',
    version: '0.1.0',
  }));
}
