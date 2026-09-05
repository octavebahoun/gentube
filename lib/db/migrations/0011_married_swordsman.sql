CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."video_source" AS ENUM('generated', 'screens', 'product', 'footage');--> statement-breakpoint
CREATE TABLE "client_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"key" text NOT NULL,
	"original_name" text,
	"mime_type" varchar(100) NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_s" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "source_asset_id" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "source" "video_source" DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_assets" ADD CONSTRAINT "client_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_assets" ADD CONSTRAINT "client_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_assets_tenant_id_idx" ON "client_assets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_assets_project_id_idx" ON "client_assets" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_source_asset_id_client_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."client_assets"("id") ON DELETE no action ON UPDATE no action;