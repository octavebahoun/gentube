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
  publications,
  youtubeTokens,
  type Tenant,
} from './schema';

/**
 * Wrapper d'isolation par tenant.
 *
 * Règle : aucune requête n'atteint Postgres sans filtre tenant_id. Le code
 * applicatif n'importe jamais `db` directement — il appelle
 * `tenantDb(tenantId)` et chaque lecture, écriture et suppression est
 * réécrite pour porter `WHERE tenant_id = $tenantId`.
 *
 * Une table n'est utilisable via ce wrapper que si elle expose une colonne
 * `tenantId` ; tout le reste lève une `TenantScopeViolationError` à l'appel
 * plutôt que de tourner silencieusement sans scope. La seule table sans
 * colonne `tenant_id` est `tenants` elle-même, joignable uniquement via
 * getTenant() / updateTenant() — toutes deux filtrées sur sa clé primaire,
 * qui *est* le tenant.
 */

export class TenantScopeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeViolationError';
  }
}

/** Toutes les tables appartenant à un tenant. Le test de complétude garantit
 *  que cette liste matche le schéma, donc une nouvelle table ne peut pas être
 *  ajoutée sans colonne tenant_id. */
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
  publications,
  subscriptions,
  billingCycles,
  paymentIntents,
  paymentAttempts,
  // Lisible via le wrapper comme n'importe quelle autre table ; le chemin
  // d'ingestion webhook est le seul écrivain qui tourne sans scope, car c'est
  // lui qui résout le tenant. Voir le commentaire de la table dans schema.ts.
  paymentWebhookEvents,
] as const;

export type TenantScopedTable = PgTable & { tenantId: AnyPgColumn };

/** Payload d'insertion avec `tenantId` rendu optionnel — le wrapper le fournit. */
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

  /** Combine avec AND le prédicat de l'appelant et le filtre tenant obligatoire. */
  function scope(table: TenantScopedTable, where?: SQL): SQL {
    const tenantFilter = eq(tenantColumn(table), tenantId);
    return where ? (and(tenantFilter, where) as SQL) : tenantFilter;
  }

  /** Rejette un payload tentant d'écrire ou de déplacer une ligne vers un autre tenant. */
  function assertOwnTenant(values: Record<string, unknown>): void {
    const declared = values.tenantId;
    if (declared !== undefined && declared !== tenantId) {
      throw new TenantScopeViolationError(
        `Refusing to write tenant_id=${String(declared)} from a tenantDb(${tenantId}) handle.`
      );
    }
  }

  // Les casts internes `as any` ci-dessous sont le prix à payer pour accepter
  // une table générique arbitraire : les builders de drizzle sont typés par
  // table concrète. Chaque signature publique reste entièrement typée, et le
  // filtre tenant est appliqué avant le cast, donc aucun appelant ne peut
  // l'esquiver.
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

    /** La ligne du tenant elle-même, filtrée sur sa clé primaire. */
    async getTenant() {
      const [row] = await (executor as any)
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      return (row ?? null) as Tenant | null;
    },

    /**
     * Met à jour la ligne du tenant. `extraWhere` permet aux appelants
     * d'ajouter un prédicat de garde (le grand livre de crédits l'utilise
     * pour sa vérification atomique `balance >= amount`).
     */
    async updateTenant(set, extraWhere) {
      const where = eq(tenants.id, tenantId);
      return (await (executor as any)
        .update(tenants)
        .set(set)
        .where(extraWhere ? and(where, extraWhere) : where)
        .returning()) as Tenant[];
    },

    /** Exécute `fn` dans une transaction avec un handle scopé au tenant lié à elle. */
    async transaction(fn) {
      if (executor !== db) {
        // Déjà dans une transaction — la réutilise plutôt que d'imbriquer.
        return await fn(handle);
      }
      return await db.transaction(async (tx) => fn(tenantDb(tenantId, tx)));
    },
  };

  return handle;
}

export { asc, eq, and, sql };
