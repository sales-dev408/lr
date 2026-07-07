import { Pool, type PoolClient as PgPoolClient, type PoolConfig, type QueryResultRow } from 'pg';
import { config } from '../config.js';

let pool: Pool | null = null;

function buildPoolConfig(): PoolConfig {
  const ssl = config.pgSslMode === 'require' ? { rejectUnauthorized: false } : false;

  return {
    connectionString: config.databaseUrl || undefined,
    ssl,
  };
}

export function getPool(): Pool | null {
  if (!config.databaseUrl) {
    return null;
  }

  if (!pool) {
    pool = new Pool(buildPoolConfig());
  }

  return pool;
}

export type PoolClient = PgPoolClient;

export async function withDbClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const activePool = getPool();
  if (!activePool) {
    throw new Error('Database is not configured');
  }

  const client = await activePool.connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const activePool = getPool();
  if (!activePool) {
    throw new Error('Database is not configured');
  }

  const result = await activePool.query<T>(text, values);
  return result.rows;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
