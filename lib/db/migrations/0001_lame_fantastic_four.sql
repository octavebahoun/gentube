CREATE TYPE "public"."billing_cycle_status" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_attempt_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('subscription', 'topup');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'past_due', 'suspended', 'canceled');--> statement-breakpoint
CREATE TABLE "billing_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"plan" "plan" NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"amount_xof" integer NOT NULL,
	"credits_granted" integer NOT NULL,
	"status" "billing_cycle_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"billing_cycle_id" integer NOT NULL,
	"payment_intent_id" integer,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'pending' NOT NULL,
	"gateway_reference" varchar(120),
	"error" text,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"plan" "plan",
	"billing_cycle_id" integer,
	"amount_xof" integer NOT NULL,
	"credits_granted" integer NOT NULL,
	"gateway_reference" varchar(120),
	"checkout_url" text,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"gateway_status" varchar(40),
	"payment_method" varchar(60),
	"fees_xof" integer,
	"net_xof" integer,
	"metadata" jsonb,
	"failure_reason" text,
	"succeeded_at" timestamp,
	"failed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"provider" varchar(40) DEFAULT 'geniuspay' NOT NULL,
	"event_id" varchar(120) NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"environment" varchar(20),
	"gateway_reference" varchar(120),
	"payload" jsonb NOT NULL,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"processing_error" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"received_from_ip" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan" "plan" NOT NULL,
	"status" "subscription_status" DEFAULT 'pending' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_cycles_tenant_id_idx" ON "billing_cycles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_cycles_subscription_id_idx" ON "billing_cycles" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_tenant_id_idx" ON "payment_attempts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_billing_cycle_id_idx" ON "payment_attempts" USING btree ("billing_cycle_id");--> statement-breakpoint
CREATE INDEX "payment_intents_tenant_id_created_at_idx" ON "payment_intents" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_gateway_reference_uq" ON "payment_intents" USING btree ("gateway_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_uq" ON "payment_webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_tenant_id_idx" ON "payment_webhook_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tenant_id_uq" ON "subscriptions" USING btree ("tenant_id");