import type { ActorType } from '../types.js';
import { dbQuery } from '../db/pool.js';

export async function writeTransactionAudit(input: {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  await dbQuery(
    `
      INSERT INTO transactions (actor_type, actor_id, action, entity_type, entity_id, metadata, ip)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `,
    [
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.ip ?? null,
    ],
  );
}
