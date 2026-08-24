import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import type {
  AnyPgColumn,
  PgTable,
  PgUpdateSetSource,
} from 'drizzle-orm/pg-core';
import { db } from './drizzle';
import {
  activityLogs,
  billingCycles,
  creditLedger,
  invitations,
  jobs,
  paymentAttempts,
  paymentIntents,
  paymentWebhookEvents,
  projects,
  shots,
  subscriptions,
  tenants,
  users,
  videos,
  youtubeTokens,
  type Tenant,
} from './schema';

/**
 * Tenant isolation wrapper.
 *
 * Rule: no query reaches Postgres without a tenant_id filter. Application code
 * never imports `db` directly — it calls `tenantDb(tenantId)` and every read,
 * write and delete is rewritten to carry `WHERE tenant_id = $tenantId`.
 *
 * A table is usable through this wrapper only if it exposes a `tenantId`
 * column; anything else throws `TenantScopeViolationError` at call time rather
 * than silently running unscoped. The one table without a `tenant_id` column
 * is `tenants` itself, which is reachable only through `getTenant()` /
 * `updateTenant()` — both filtered on its primary key, which *is* the tenant.
 */

export class TenantScopeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeViolationError';
  }
}

/** Every tenant-owned table. The completeness test asserts this list matches
 *  the schema, so a new table cannot be added without a tenant_id column. */
export const TENANT_SCOPED_TABLES = [
  users,
  invitations,
  activityLogs,
  projects,
  videos,
  shots,
  jobs,
  creditLedger,
  youtubeTokens,
  subscriptions,
  billingCycles,
  paymentIntents,
  paymentAttempts,
  // Readable through the wrapper like any other table; the webhook intake path
  // is the one writer that runs unscoped, because it is what resolves the
  // tenant. See the table's comment in schema.ts.
  paymentWebhookEvents,
] as const;

export type TenantScopedTable = PgTable & { tenantId: AnyPgColumn };

/** Insert payload with `tenantId` made optional — the wrapper supplies it. */
export type TenantInsert<T extends TenantScopedTable> = Omit<
  T['$inferInsert'],
  'tenantId'
> & { tenantId?: number };

export type QueryOptions = {
  orderBy?: (SQL | AnyPgColumn)[];
  limit?: number;
  offset?: number;
};

export interface TenantDb {
  readonly tenantId: number;

  findMany<T extends TenantScopedTable>(
    table: T,
    where?: SQL,
    options?: QueryOptions
  ): Promise<T['$inferSelect'][]>;

  findFirst<T extends TenantScopedTable>(
    table: T,
    where?: SQL,
    options?: Omit<QueryOptions, 'limit'>
  ): Promise<T['$inferSelect'] | null>;

  findById<T extends TenantScopedTable>(
    table: T,
    id: number
  ): Promise<T['$inferSelect'] | null>;

  count(table: TenantScopedTable, where?: SQL): Promise<number>;

  insert<T extends TenantScopedTable>(
    table: T,
    values: TenantInsert<T> | TenantInsert<T>[]
  ): Promise<T['$inferSelect'][]>;

  update<T extends TenantScopedTable>(
    table: T,
    set: PgUpdateSetSource<T>,
    where?: SQL
  ): Promise<T['$inferSelect'][]>;

  delete<T extends TenantScopedTable>(
    table: T,
    where?: SQL
  ): Promise<T['$inferSelect'][]>;

  getTenant(): Promise<Tenant | null>;

  updateTenant(
    set: PgUpdateSetSource<typeof tenants>,
    extraWhere?: SQL
  ): Promise<Tenant[]>;

  transaction<T>(fn: (tx: TenantDb) => Promise<T>): Promise<T>;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;

function tenantColumn(table: TenantScopedTable): AnyPgColumn {
  const column = table.tenantId;
  if (!column) {
    throw new TenantScopeViolationError(
      'Table has no tenant_id column and cannot be queried through tenantDb(). ' +
        'Add a tenant_id column, or handle it explicitly in lib/db.'
    );
  }
  return column;
}

function assertTenantId(tenantId: number): void {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new TenantScopeViolationError(
      `Invalid tenantId: ${JSON.stringify(tenantId)}. A tenant-scoped query ` +
        'requires a positive integer tenant id.'
    );
  }
}

export function tenantDb(tenantId: number, executor: Executor = db): TenantDb {
  assertTenantId(tenantId);

  /** ANDs the caller's predicate with the mandatory tenant filter. */
  function scope(table: TenantScopedTable, where?: SQL): SQL {
    const tenantFilter = eq(tenantColumn(table), tenantId);
    return where ? (and(tenantFilter, where) as SQL) : tenantFilter;
  }

  /** Rejects a payload trying to write or move a row into another tenant. */
  function assertOwnTenant(values: Record<string, unknown>): void {
    const declared = values.tenantId;
    if (declared !== undefined && declared !== tenantId) {
      throw new TenantScopeViolationError(
        `Refusing to write tenant_id=${String(declared)} from a tenantDb(${tenantId}) handle.`
      );
    }
  }

  // The internal `as any` casts below are the price of accepting an arbitrary
  // generic table: drizzle's builders are typed per concrete table. Every
  // public signature stays fully typed, and the tenant filter is applied
  // before the cast, so no caller can bypass it.
  const handle: TenantDb = {
    tenantId,

    async findMany(table, where, options = {}) {
      let query = (executor as any)
        .select()
        .from(table)
        .where(scope(table, where));

      if (options.orderBy?.length) query = query.orderBy(...options.orderBy);
      if (options.limit !== undefined) query = query.limit(options.limit);
      if (options.offset !== undefined) query = query.offset(options.offset);

      return await query;
    },

    async findFirst(table, where, options = {}) {
      const rows = await handle.findMany(table, where, { ...options, limit: 1 });
      return rows[0] ?? null;
    },

    async findById(table, id) {
      const idColumn = (table as any).id as AnyPgColumn | undefined;
      if (!idColumn) {
        throw new TenantScopeViolationError('Table has no id column.');
      }
      return await handle.findFirst(table, eq(idColumn, id));
    },

    async count(table, where) {
      const [row] = await (executor as any)
        .select({ value: sql<number>`count(*)::int` })
        .from(table)
        .where(scope(table, where));
      return row?.value ?? 0;
    },

    async insert(table, values) {
      const rows = Array.isArray(values) ? values : [values];
      if (rows.length === 0) return [];

      const scopedRows = rows.map((row) => {
        assertOwnTenant(row as Record<string, unknown>);
        return { ...row, tenantId };
      });

      return await (executor as any)
        .insert(table)
        .values(scopedRows)
        .returning();
    },

    async update(table, set, where) {
      assertOwnTenant(set as Record<string, unknown>);
      return await (executor as any)
        .update(table)
        .set(set)
        .where(scope(table, where))
        .returning();
    },

    async delete(table, where) {
      return await (executor as any)
        .delete(table)
        .where(scope(table, where))
        .returning();
    },

    /** The tenant row itself, filtered on its primary key. */
    async getTenant() {
      const [row] = await (executor as any)
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      return (row ?? null) as Tenant | null;
    },

    /**
     * Updates the tenant row. `extraWhere` lets callers add a guard predicate
     * (the credit ledger uses it for its atomic `balance >= amount` check).
     */
    async updateTenant(set, extraWhere) {
      const where = eq(tenants.id, tenantId);
      return (await (executor as any)
        .update(tenants)
        .set(set)
        .where(extraWhere ? and(where, extraWhere) : where)
        .returning()) as Tenant[];
    },

    /** Runs `fn` in a transaction with a tenant-scoped handle bound to it. */
    async transaction(fn) {
      if (executor !== db) {
        // Already inside a transaction — reuse it rather than nesting.
        return await fn(handle);
      }
      return await db.transaction(async (tx) => fn(tenantDb(tenantId, tx)));
    },
  };

  return handle;
}

export { asc, eq, and, sql };
