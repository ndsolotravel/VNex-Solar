import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runInTenantTransaction<T>(
  db: NodePgDatabase,
  organizationId: string,
  fn: (tx: NodePgDatabase) => Promise<T>,
): Promise<T> {
  if (!UUID_REGEX.test(organizationId)) {
    throw new Error('Invalid organizationId UUID for tenant RLS transaction');
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`);
    return fn(tx as unknown as NodePgDatabase);
  });
}
