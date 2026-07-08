import postgres from 'npm:postgres';
import { config } from './config.ts';

const connectionString = config.databaseUrl;

if (!connectionString) {
  throw new Error('SUPABASE_DB_URL or DATABASE_URL is required');
}

const sql = postgres(connectionString, {
  ssl: config.pgSslMode === 'disable' ? false : 'require',
  max: 1,
});

export interface PoolClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export async function dbQuery<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  return await (sql.unsafe as unknown as (query: string, args?: unknown[]) => Promise<T[]>)(text, values as unknown[]);
}

export async function withDbClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  return await (sql.begin as unknown as <R>(cb: (tx: typeof sql) => Promise<R>) => Promise<R>)(async (tx) => {
    const client: PoolClient = {
      async query<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
        const command = text.trim().toUpperCase();
        if (command === 'BEGIN' || command === 'COMMIT' || command === 'ROLLBACK') {
          return { rows: [] as T[] };
        }
        const rows = await (tx.unsafe as unknown as (query: string, args?: unknown[]) => Promise<T[]>)(text, values as unknown[]);
        return { rows };
      },
    };
    return await handler(client);
  });
}

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
