CREATE TYPE "public"."credit_pocket" AS ENUM('plan', 'topup');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('scheduled', 'uploading', 'published', 'failed');--> statement-breakpoint
ALTER TYPE "public"."credit_reason" ADD VALUE 'plan_expiry';--> statement-breakpoint
CREATE TABLE "publications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"video_id" integer NOT NULL,
	"provider" varchar(40) DEFAULT 'youtube' NOT NULL,
	"external_id" varchar(64),
	"status" "publication_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_for" timestamp,
	"published_at" timestamp,
	"error" text,
	"quota_units" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_quota_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" varchar(10) NOT NULL,
	"units_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "pocket" "credit_pocket" DEFAULT 'plan' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "credits_plan" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "credits_topup" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_credits_expire_at" timestamp;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publications_tenant_id_idx" ON "publications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "publications_video_id_idx" ON "publications" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "publications_scheduled_for_idx" ON "publications" USING btree ("scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_quota_usage_day_uq" ON "youtube_quota_usage" USING btree ("day");--> statement-breakpoint
-- Report des soldes existants dans la poche qui n'expire jamais.
--
-- L'invariant est `credits_balance = credits_plan + credits_topup` ; sans ce
-- report, tout tenant déjà en base aurait un solde sans poche et le premier
-- débit échouerait sur une garde à zéro.
--
-- Versés en `topup` et non en `plan` : on ne sait pas de quel cycle ces
-- crédits venaient, et faire expirer par défaut ce qu'un client a peut-être
-- payé serait le pire des deux choix.
UPDATE "tenants" SET "credits_topup" = "credits_balance" WHERE "credits_balance" > 0;
