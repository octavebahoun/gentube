import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const planEnum = pgEnum('plan', ['starter', 'pro', 'business']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member']);
export const pipelineEnum = pgEnum('pipeline', ['image', 'video', 'mixed']);
export const resolutionEnum = pgEnum('resolution', ['480p', '720p']);

// `failed` is not in the spec but every other state is non-terminal on error,
// so a pipeline crash would otherwise leave a video stuck in `generating`.
export const videoStatusEnum = pgEnum('video_status', [
  'draft',
  'validated',
  'generating',
  'rendering',
  'rendered',
  'published',
  'failed',
]);

export const shotTypeEnum = pgEnum('shot_type', ['image', 'video']);
export const shotStatusEnum = pgEnum('shot_status', [
  'pending',
  'generating',
  'ready',
  'failed',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
]);

export const creditReasonEnum = pgEnum('credit_reason', [
  'signup_grant',
  'subscription_grant',
  'topup',
  'video_debit',
  'video_refund',
  'manual_adjustment',
]);

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  plan: planEnum('plan').notNull().default('starter'),
  // Denormalised running total of `credit_ledger`. Only ever mutated through
  // lib/credits — see the invariant test in lib/credits/credits.test.ts.
  creditsBalance: integer('credits_balance').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 100 }),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [index('users_tenant_id_idx').on(t.tenantId)]
);

export const invitations = pgTable(
  'invitations',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    email: varchar('email', { length: 255 }).notNull(),
    role: userRoleEnum('role').notNull().default('member'),
    invitedBy: integer('invited_by')
      .notNull()
      .references(() => users.id),
    invitedAt: timestamp('invited_at').notNull().defaultNow(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
  },
  (t) => [index('invitations_tenant_id_idx').on(t.tenantId)]
);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: integer('user_id').references(() => users.id),
    action: text('action').notNull(),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
    ipAddress: varchar('ip_address', { length: 45 }),
  },
  (t) => [index('activity_logs_tenant_id_idx').on(t.tenantId)]
);

// ---------------------------------------------------------------------------
// Video generation domain
//
// Every table below carries `tenant_id` even when it is reachable through a
// parent FK (shots -> videos -> projects -> tenant). That denormalisation is
// what makes tenantDb() enforceable as a single WHERE clause instead of a
// join chain, and it is what the isolation tests assert against.
// ---------------------------------------------------------------------------

export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 120 }).notNull(),
    defaultPipeline: pipelineEnum('default_pipeline').notNull().default('mixed'),
    voiceId: varchar('voice_id', { length: 100 }),
    youtubeChannelId: varchar('youtube_channel_id', { length: 100 }),
    stylePrompt: text('style_prompt'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('projects_tenant_id_idx').on(t.tenantId)]
);

export const videos = pgTable(
  'videos',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    title: varchar('title', { length: 200 }).notNull(),
    status: videoStatusEnum('status').notNull().default('draft'),
    pipelineOverride: pipelineEnum('pipeline_override'),
    // Drives credit pricing: 1 credit/s at 480p, 4 credits/s at 720p.
    resolution: resolutionEnum('resolution').notNull().default('480p'),
    creditsEstimated: integer('credits_estimated').notNull().default(0),
    creditsConsumed: integer('credits_consumed').notNull().default(0),
    youtubeVideoId: varchar('youtube_video_id', { length: 32 }),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('videos_tenant_id_idx').on(t.tenantId),
    index('videos_project_id_idx').on(t.projectId),
  ]
);

export const shots = pgTable(
  'shots',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    videoId: integer('video_id')
      .notNull()
      .references(() => videos.id),
    order: integer('order').notNull(),
    type: shotTypeEnum('type').notNull(),
    prompt: text('prompt').notNull(),
    durationS: integer('duration_s').notNull(),
    assetUrl: text('asset_url'),
    status: shotStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('shots_tenant_id_idx').on(t.tenantId),
    index('shots_video_id_order_idx').on(t.videoId, t.order),
  ]
);

export const jobs = pgTable(
  'jobs',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    videoId: integer('video_id')
      .notNull()
      .references(() => videos.id),
    step: varchar('step', { length: 60 }).notNull(),
    // Provider-side id (Replicate prediction, Lambda render, ...). Unique so a
    // replayed webhook resolves to exactly one job.
    externalId: varchar('external_id', { length: 120 }),
    status: jobStatusEnum('status').notNull().default('queued'),
    payload: jsonb('payload'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('jobs_tenant_id_idx').on(t.tenantId),
    index('jobs_video_id_idx').on(t.videoId),
    uniqueIndex('jobs_external_id_uq').on(t.externalId),
  ]
);

export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // Negative for a debit, positive for a grant/top-up/refund.
    delta: integer('delta').notNull(),
    reason: creditReasonEnum('reason').notNull(),
    videoId: integer('video_id').references(() => videos.id),
    balanceAfter: integer('balance_after').notNull(),
    // Set by webhook-driven writes (GeniusPay, Replicate) so a replay is a
    // no-op rather than a double credit.
    idempotencyKey: varchar('idempotency_key', { length: 120 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('credit_ledger_tenant_id_created_at_idx').on(t.tenantId, t.createdAt),
    uniqueIndex('credit_ledger_idempotency_key_uq').on(t.idempotencyKey),
  ]
);

export const youtubeTokens = pgTable(
  'youtube_tokens',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // AES-256-GCM ciphertext produced by lib/crypto/encryption.ts.
    // Never log these columns, never expose them through an API route.
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    scope: text('scope'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('youtube_tokens_tenant_id_uq').on(t.tenantId)]
);

// ---------------------------------------------------------------------------
// Billing (GeniusPay — mobile money + card, XOF)
//
// The platform holds ONE merchant account: its keys live in the environment,
// not in the database. There is deliberately no per-tenant credentials table —
// tenants pay the platform, they do not collect payments themselves.
//
// Money is stored as `amount_xof` integers. XOF has no minor unit, so there is
// no cents column anywhere and no float ever touches an amount.
// ---------------------------------------------------------------------------

export const paymentKindEnum = pgEnum('payment_kind', [
  'subscription',
  'topup',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  // Local row created, gateway not called yet.
  'created',
  // Checkout URL handed to the user, waiting for the gateway's word.
  'pending',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  // Created at checkout, before the first payment confirms.
  'pending',
  'active',
  'past_due',
  // Retries exhausted (specs §3.A): the tenant keeps its balance but the
  // subscription no longer renews.
  'suspended',
  'canceled',
]);

export const billingCycleStatusEnum = pgEnum('billing_cycle_status', [
  'pending',
  'paid',
  'failed',
]);

export const paymentAttemptStatusEnum = pgEnum('payment_attempt_status', [
  'pending',
  'succeeded',
  'failed',
]);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    // One subscription per tenant: a plan change reuses this row rather than
    // stacking a second one.
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    plan: planEnum('plan').notNull(),
    status: subscriptionStatusEnum('status').notNull().default('pending'),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    // Set when a downgrade is scheduled; the paid period still runs out.
    cancelAt: timestamp('cancel_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('subscriptions_tenant_id_uq').on(t.tenantId)]
);

export const billingCycles = pgTable(
  'billing_cycles',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    plan: planEnum('plan').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    amountXof: integer('amount_xof').notNull(),
    // The plan allowance this cycle buys, recorded so the grant is auditable
    // against the price that was actually charged.
    creditsGranted: integer('credits_granted').notNull(),
    status: billingCycleStatusEnum('status').notNull().default('pending'),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('billing_cycles_tenant_id_idx').on(t.tenantId),
    index('billing_cycles_subscription_id_idx').on(t.subscriptionId),
  ]
);

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: paymentKindEnum('kind').notNull(),
    // Subscription payments only.
    plan: planEnum('plan'),
    billingCycleId: integer('billing_cycle_id').references(
      () => billingCycles.id
    ),
    amountXof: integer('amount_xof').notNull(),
    creditsGranted: integer('credits_granted').notNull(),
    // GeniusPay's own id for the transaction. Unique because it is what the
    // webhook resolves a tenant from — one reference, one intent, one tenant.
    gatewayReference: varchar('gateway_reference', { length: 120 }),
    checkoutUrl: text('checkout_url'),
    status: paymentStatusEnum('status').notNull().default('created'),
    // The gateway's own words, kept verbatim for support and reconciliation.
    gatewayStatus: varchar('gateway_status', { length: 40 }),
    paymentMethod: varchar('payment_method', { length: 60 }),
    feesXof: integer('fees_xof'),
    netXof: integer('net_xof'),
    metadata: jsonb('metadata'),
    failureReason: text('failure_reason'),
    succeededAt: timestamp('succeeded_at'),
    failedAt: timestamp('failed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payment_intents_tenant_id_created_at_idx').on(
      t.tenantId,
      t.createdAt
    ),
    uniqueIndex('payment_intents_gateway_reference_uq').on(t.gatewayReference),
  ]
);

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingCycleId: integer('billing_cycle_id')
      .notNull()
      .references(() => billingCycles.id),
    paymentIntentId: integer('payment_intent_id').references(
      () => paymentIntents.id
    ),
    attemptNumber: integer('attempt_number').notNull().default(1),
    status: paymentAttemptStatusEnum('status').notNull().default('pending'),
    gatewayReference: varchar('gateway_reference', { length: 120 }),
    error: text('error'),
    attemptedAt: timestamp('attempted_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payment_attempts_tenant_id_idx').on(t.tenantId),
    index('payment_attempts_billing_cycle_id_idx').on(t.billingCycleId),
  ]
);

/**
 * Audit log of every webhook that got past signature verification, and the
 * idempotency guard for the money path.
 *
 * `tenant_id` is nullable here and only here: an event is written before it is
 * known which tenant it belongs to — the tenant is *resolved* from the intent
 * behind `gateway_reference`, and an event matching no intent belongs to no
 * tenant. It is the same exception as `getUser()` in lib/db/queries.ts, and it
 * is why the webhook path is the one place allowed to touch this table
 * unscoped (see lib/billing/webhook.ts).
 */
export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id').references(() => tenants.id),
    provider: varchar('provider', { length: 40 }).notNull().default('geniuspay'),
    eventId: varchar('event_id', { length: 120 }).notNull(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    environment: varchar('environment', { length: 20 }),
    gatewayReference: varchar('gateway_reference', { length: 120 }),
    payload: jsonb('payload').notNull(),
    signatureValid: boolean('signature_valid').notNull().default(false),
    // Null while the event has not been acted upon. A replay of an unprocessed
    // event is allowed to run again; a replay of a processed one is a no-op.
    processedAt: timestamp('processed_at'),
    processingError: text('processing_error'),
    receivedAt: timestamp('received_at').notNull().defaultNow(),
    receivedFromIp: varchar('received_from_ip', { length: 45 }),
  },
  (t) => [
    // The idempotency guarantee: one gateway event credits at most once.
    uniqueIndex('payment_webhook_events_provider_event_id_uq').on(
      t.provider,
      t.eventId
    ),
    index('payment_webhook_events_tenant_id_idx').on(t.tenantId),
  ]
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  invitations: many(invitations),
  activityLogs: many(activityLogs),
  projects: many(projects),
  videos: many(videos),
  creditLedger: many(creditLedger),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  invitationsSent: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [invitations.tenantId],
    references: [tenants.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [activityLogs.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [projects.tenantId],
    references: [tenants.id],
  }),
  videos: many(videos),
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [videos.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [videos.projectId],
    references: [projects.id],
  }),
  shots: many(shots),
  jobs: many(jobs),
}));

export const shotsRelations = relations(shots, ({ one }) => ({
  video: one(videos, {
    fields: [shots.videoId],
    references: [videos.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  video: one(videos, {
    fields: [jobs.videoId],
    references: [videos.id],
  }),
}));

export const creditLedgerRelations = relations(creditLedger, ({ one }) => ({
  tenant: one(tenants, {
    fields: [creditLedger.tenantId],
    references: [tenants.id],
  }),
  video: one(videos, {
    fields: [creditLedger.videoId],
    references: [videos.id],
  }),
}));

export const youtubeTokensRelations = relations(youtubeTokens, ({ one }) => ({
  tenant: one(tenants, {
    fields: [youtubeTokens.tenantId],
    references: [tenants.id],
  }),
}));

export const subscriptionsRelations = relations(
  subscriptions,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [subscriptions.tenantId],
      references: [tenants.id],
    }),
    cycles: many(billingCycles),
  })
);

export const billingCyclesRelations = relations(
  billingCycles,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [billingCycles.tenantId],
      references: [tenants.id],
    }),
    subscription: one(subscriptions, {
      fields: [billingCycles.subscriptionId],
      references: [subscriptions.id],
    }),
    attempts: many(paymentAttempts),
  })
);

export const paymentIntentsRelations = relations(paymentIntents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [paymentIntents.tenantId],
    references: [tenants.id],
  }),
  billingCycle: one(billingCycles, {
    fields: [paymentIntents.billingCycleId],
    references: [billingCycles.id],
  }),
}));

export const paymentAttemptsRelations = relations(
  paymentAttempts,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [paymentAttempts.tenantId],
      references: [tenants.id],
    }),
    billingCycle: one(billingCycles, {
      fields: [paymentAttempts.billingCycleId],
      references: [billingCycles.id],
    }),
    paymentIntent: one(paymentIntents, {
      fields: [paymentAttempts.paymentIntentId],
      references: [paymentIntents.id],
    }),
  })
);

export const paymentWebhookEventsRelations = relations(
  paymentWebhookEvents,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [paymentWebhookEvents.tenantId],
      references: [tenants.id],
    }),
  })
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type Shot = typeof shots.$inferSelect;
export type NewShot = typeof shots.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert;
export type YoutubeToken = typeof youtubeTokens.$inferSelect;
export type NewYoutubeToken = typeof youtubeTokens.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type BillingCycle = typeof billingCycles.$inferSelect;
export type NewBillingCycle = typeof billingCycles.$inferInsert;
export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type NewPaymentIntent = typeof paymentIntents.$inferInsert;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttempt = typeof paymentAttempts.$inferInsert;
export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
export type NewPaymentWebhookEvent = typeof paymentWebhookEvents.$inferInsert;

export type Plan = (typeof planEnum.enumValues)[number];
export type Resolution = (typeof resolutionEnum.enumValues)[number];
export type Pipeline = (typeof pipelineEnum.enumValues)[number];
export type VideoStatus = (typeof videoStatusEnum.enumValues)[number];
export type PaymentKind = (typeof paymentKindEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type SubscriptionStatus =
  (typeof subscriptionStatusEnum.enumValues)[number];
export type BillingCycleStatus =
  (typeof billingCycleStatusEnum.enumValues)[number];
export type PaymentAttemptStatus =
  (typeof paymentAttemptStatusEnum.enumValues)[number];

export type TenantDataWithMembers = Tenant & {
  users: Pick<User, 'id' | 'name' | 'email' | 'role'>[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TENANT = 'CREATE_TENANT',
  REMOVE_TENANT_MEMBER = 'REMOVE_TENANT_MEMBER',
  INVITE_TENANT_MEMBER = 'INVITE_TENANT_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
}
