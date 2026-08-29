CREATE TYPE "public"."billing_cycle_status" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('active', 'disabled', 'invalid_credentials');--> statement-breakpoint
CREATE TYPE "public"."gateway_environment" AS ENUM('sandbox', 'live');--> statement-breakpoint
CREATE TYPE "public"."payment_attempt_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('subscription', 'topup');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'suspended', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."credit_reason" ADD VALUE 'plan_quota_expired' BEFORE 'manual_adjustment';--> statement-breakpoint
CREATE TABLE "billing_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"cycle_number" integer NOT NULL,
	"plan" "plan" NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"amount_xof" integer NOT NULL,
	"credits_granted" integer NOT NULL,
	"status" "billing_cycle_status" DEFAULT 'pending' NOT NULL,
	"invoice_number" varchar(40) NOT NULL,
	"paid_at" timestamp,
	"failed_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"provider" varchar(40) DEFAULT 'geniuspay' NOT NULL,
	"environment" "gateway_environment" NOT NULL,
	"api_key_public" text NOT NULL,
	"api_secret_encrypted" text NOT NULL,
	"webhook_secret_encrypted" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"merchant_id" varchar(120),
	"business_name" varchar(200),
	"status" "credential_status" DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"billing_cycle_id" integer NOT NULL,
	"attempt_number" integer NOT NULL,
	"gateway_reference" varchar(120),
	"status" "payment_attempt_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"provider" varchar(40) DEFAULT 'geniuspay' NOT NULL,
	"environment" "gateway_environment" NOT NULL,
	"billing_cycle_id" integer,
	"payment_attempt_id" integer,
	"amount_xof" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'XOF' NOT NULL,
	"credits_granted" integer NOT NULL,
	"gateway_reference" varchar(120),
	"checkout_url" text,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"gateway_status" varchar(40),
	"gateway_payment_method" varchar(40),
	"gateway_fees_xof" integer,
	"gateway_net_xof" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"initiated_from_ip" varchar(45),
	"succeeded_at" timestamp,
	"failed_at" timestamp,
	"failure_reason" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"provider" varchar(40) DEFAULT 'geniuspay' NOT NULL,
	"gateway_event_id" varchar(160) NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"environment" "gateway_environment" NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"processing_error" text,
	"received_from_ip" varchar(45),
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan" "plan" NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp DEFAULT now() NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancel_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "plan_delta" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_credits_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_credentials" ADD CONSTRAINT "gateway_credentials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_cycles_tenant_id_idx" ON "billing_cycles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_cycles_subscription_number_uq" ON "billing_cycles" USING btree ("subscription_id","cycle_number");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_cycles_invoice_number_uq" ON "billing_cycles" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_credentials_tenant_uq" ON "gateway_credentials" USING btree ("tenant_id","provider","environment") WHERE tenant_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_credentials_platform_uq" ON "gateway_credentials" USING btree ("provider","environment") WHERE tenant_id is null;--> statement-breakpoint
CREATE INDEX "payment_attempts_tenant_id_idx" ON "payment_attempts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_cycle_idx" ON "payment_attempts" USING btree ("billing_cycle_id");--> statement-breakpoint
CREATE INDEX "payment_intents_tenant_id_idx" ON "payment_intents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payment_intents_status_idx" ON "payment_intents" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_gateway_reference_uq" ON "payment_intents" USING btree ("provider","gateway_reference") WHERE gateway_reference is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_uq" ON "payment_webhook_events" USING btree ("provider","gateway_event_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_tenant_idx" ON "payment_webhook_events" USING btree ("tenant_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tenant_uq" ON "subscriptions" USING btree ("tenant_id");