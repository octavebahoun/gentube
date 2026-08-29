import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

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
  'plan_quota_expired',
  'manual_adjustment',
]);

// --- Billing ---------------------------------------------------------------

export const gatewayEnvironmentEnum = pgEnum('gateway_environment', [
  'sandbox',
  'live',
]);

export const credentialStatusEnum = pgEnum('credential_status', [
  'active',
  'disabled',
  'invalid_credentials',
]);

export const paymentKindEnum = pgEnum('payment_kind', [
  'subscription',
  'topup',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'created',
  'pending',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'suspended',
  'cancelled',
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

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  plan: planEnum('plan').notNull().default('starter'),
  // Denormalised running total of `credit_ledger`. Only ever mutated through
  // lib/credits — see the invariant test in lib/credits/ledger.test.ts.
  creditsBalance: integer('credits_balance').notNull().default(0),
  // The share of `credits_balance` that came from the plan allowance and dies
  // at the end of the billing cycle. Purchased credits never expire (specs
  // §1), so debits consume this bucket first. Invariant, asserted by test:
  // 0 <= plan_credits_balance <= credits_balance.
  planCreditsBalance: integer('plan_credits_balance').notNull().default(0),
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
    // The share of `delta` that moved the expiring plan bucket rather than the
    // permanent one. Recorded so a refund puts credits back where they came
    // from, instead of laundering expiring quota into credits that never die.
    planDelta: integer('plan_delta').notNull().default(0),
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
// Billing (GeniusPay — Mobile Money and card, XOF)
//
// Money is stored as whole XOF integers. The franc has no minor unit and the
// gateway takes the amount in that same unit — its own examples post
// {"amount": 5000} for 5 000 XOF — so there is no cents conversion anywhere in
// this file. Never introduce a float here.
// ---------------------------------------------------------------------------

export const gatewayCredentials = pgTable(
  'gateway_credentials',
  {
    id: serial('id').primaryKey(),
    // NULL = the platform's own merchant account, which is what bills tenants.
    // A non-null tenant is reserved for a tenant collecting on its own account.
    tenantId: integer('tenant_id').references(() => tenants.id),
    provider: varchar('provider', { length: 40 }).notNull().default('geniuspay'),
    environment: gatewayEnvironmentEnum('environment').notNull(),
    apiKeyPublic: text('api_key_public').notNull(),
    // AES-256-GCM under PAYMENT_CREDENTIALS_KEK — a key distinct from
    // ENCRYPTION_KEY, so compromising video tokens does not expose money.
    // Never select these columns into an HTTP response; see lib/payments/credentials.ts.
    apiSecretEncrypted: text('api_secret_encrypted').notNull(),
    webhookSecretEncrypted: text('webhook_secret_encrypted').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    merchantId: varchar('merchant_id', { length: 120 }),
    businessName: varchar('business_name', { length: 200 }),
    status: credentialStatusEnum('status').notNull().default('active'),
    lastVerifiedAt: timestamp('last_verified_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('gateway_credentials_tenant_uq')
      .on(t.tenantId, t.provider, t.environment)
      .where(sql`tenant_id is not null`),
    // Postgres treats NULLs as distinct, so the platform row needs its own
    // partial unique index or nothing would stop a second one.
    uniqueIndex('gateway_credentials_platform_uq')
      .on(t.provider, t.environment)
      .where(sql`tenant_id is null`),
  ]
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    plan: planEnum('plan').notNull(),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start').notNull().defaultNow(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    cancelAt: timestamp('cancel_at'),
    cancelledAt: timestamp('cancelled_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('subscriptions_tenant_uq').on(t.tenantId)]
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
    cycleNumber: integer('cycle_number').notNull(),
    plan: planEnum('plan').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    amountXof: integer('amount_xof').notNull(),
    creditsGranted: integer('credits_granted').notNull(),
    status: billingCycleStatusEnum('status').notNull().default('pending'),
    invoiceNumber: varchar('invoice_number', { length: 40 }).notNull(),
    paidAt: timestamp('paid_at'),
    failedReason: text('failed_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('billing_cycles_tenant_id_idx').on(t.tenantId),
    uniqueIndex('billing_cycles_subscription_number_uq').on(
      t.subscriptionId,
      t.cycleNumber
    ),
    uniqueIndex('billing_cycles_invoice_number_uq').on(t.invoiceNumber),
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
    attemptNumber: integer('attempt_number').notNull(),
    gatewayReference: varchar('gateway_reference', { length: 120 }),
    status: paymentAttemptStatusEnum('status').notNull().default('pending'),
    error: text('error'),
    attemptedAt: timestamp('attempted_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payment_attempts_tenant_id_idx').on(t.tenantId),
    index('payment_attempts_cycle_idx').on(t.billingCycleId),
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
    provider: varchar('provider', { length: 40 }).notNull().default('geniuspay'),
    environment: gatewayEnvironmentEnum('environment').notNull(),
    // Set for `subscription` intents; null for a one-off top-up.
    billingCycleId: integer('billing_cycle_id').references(() => billingCycles.id),
    paymentAttemptId: integer('payment_attempt_id').references(
      () => paymentAttempts.id
    ),
    amountXof: integer('amount_xof').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('XOF'),
    // What this payment buys. Written at creation so the webhook never has to
    // recompute a price from a payload it does not trust.
    creditsGranted: integer('credits_granted').notNull(),
    gatewayReference: varchar('gateway_reference', { length: 120 }),
    checkoutUrl: text('checkout_url'),
    status: paymentStatusEnum('status').notNull().default('created'),
    gatewayStatus: varchar('gateway_status', { length: 40 }),
    gatewayPaymentMethod: varchar('gateway_payment_method', { length: 40 }),
    gatewayFeesXof: integer('gateway_fees_xof'),
    gatewayNetXof: integer('gateway_net_xof'),
    metadata: jsonb('metadata').notNull().default({}),
    initiatedFromIp: varchar('initiated_from_ip', { length: 45 }),
    succeededAt: timestamp('succeeded_at'),
    failedAt: timestamp('failed_at'),
    failureReason: text('failure_reason'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payment_intents_tenant_id_idx').on(t.tenantId),
    index('payment_intents_status_idx').on(t.tenantId, t.status),
    uniqueIndex('payment_intents_gateway_reference_uq')
      .on(t.provider, t.gatewayReference)
      .where(sql`gateway_reference is not null`),
  ]
);

export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: serial('id').primaryKey(),
    // Null until step 3 of the pipeline resolves the tenant from the payload.
    tenantId: integer('tenant_id').references(() => tenants.id),
    provider: varchar('provider', { length: 40 }).notNull().default('geniuspay'),
    // The gateway's own event id. Unique per provider — this constraint is what
    // makes a replayed webhook a no-op rather than a second grant.
    gatewayEventId: varchar('gateway_event_id', { length: 160 }).notNull(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    environment: gatewayEnvironmentEnum('environment').notNull(),
    payload: jsonb('payload').notNull(),
    signatureValid: boolean('signature_valid').notNull().default(false),
    processingError: text('processing_error'),
    receivedFromIp: varchar('received_from_ip', { length: 45 }),
    receivedAt: timestamp('received_at').notNull().defaultNow(),
    processedAt: timestamp('processed_at'),
  },
  (t) => [
    uniqueIndex('payment_webhook_events_provider_event_uq').on(
      t.provider,
      t.gatewayEventId
    ),
    index('payment_webhook_events_tenant_idx').on(t.tenantId, t.receivedAt),
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

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [subscriptions.tenantId],
    references: [tenants.id],
  }),
  cycles: many(billingCycles),
}));

export const billingCyclesRelations = relations(billingCycles, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [billingCycles.tenantId],
    references: [tenants.id],
  }),
  subscription: one(subscriptions, {
    fields: [billingCycles.subscriptionId],
    references: [subscriptions.id],
  }),
  attempts: many(paymentAttempts),
}));

export const paymentAttemptsRelations = relations(paymentAttempts, ({ one }) => ({
  tenant: one(tenants, {
    fields: [paymentAttempts.tenantId],
    references: [tenants.id],
  }),
  billingCycle: one(billingCycles, {
    fields: [paymentAttempts.billingCycleId],
    references: [billingCycles.id],
  }),
}));

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

export const paymentWebhookEventsRelations = relations(
  paymentWebhookEvents,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [paymentWebhookEvents.tenantId],
      references: [tenants.id],
    }),
  })
);

export const gatewayCredentialsRelations = relations(
  gatewayCredentials,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [gatewayCredentials.tenantId],
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

export type GatewayCredential = typeof gatewayCredentials.$inferSelect;
export type NewGatewayCredential = typeof gatewayCredentials.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type BillingCycle = typeof billingCycles.$inferSelect;
export type NewBillingCycle = typeof billingCycles.$inferInsert;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttempt = typeof paymentAttempts.$inferInsert;
export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type NewPaymentIntent = typeof paymentIntents.$inferInsert;
export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
export type NewPaymentWebhookEvent = typeof paymentWebhookEvents.$inferInsert;

export type Plan = (typeof planEnum.enumValues)[number];
export type GatewayEnvironment = (typeof gatewayEnvironmentEnum.enumValues)[number];
export type PaymentKind = (typeof paymentKindEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type Resolution = (typeof resolutionEnum.enumValues)[number];
export type Pipeline = (typeof pipelineEnum.enumValues)[number];
export type VideoStatus = (typeof videoStatusEnum.enumValues)[number];

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
