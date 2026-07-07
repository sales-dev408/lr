import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { closePool, withDbClient } from './pool.js';
import { config } from '../config.js';

const migrationsDir = path.join(process.cwd(), 'src', 'db', 'migrations');

async function ensureMigrationTable(): Promise<void> {
  await withDbClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function appliedMigrations(): Promise<Set<string>> {
  const rows = await withDbClient(async (client) => {
    const result = await client.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version');
    return result.rows;
  });
  return new Set(rows.map((row: { version: string }) => row.version));
}

async function runMigration(fileName: string): Promise<void> {
  const sql = await readFile(path.join(migrationsDir, fileName), 'utf8');
  await withDbClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [fileName]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function main(): Promise<void> {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  await ensureMigrationTable();
  const applied = await appliedMigrations();
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const fileName of files) {
    if (!applied.has(fileName)) {
      await runMigration(fileName);
      process.stdout.write(`Applied ${fileName}\n`);
    }
  }

  await closePool();
}

void main().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exitCode = 1;
});
