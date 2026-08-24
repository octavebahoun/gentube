CREATE TYPE "public"."duration_source" AS ENUM('estimated', 'measured');--> statement-breakpoint
CREATE TYPE "public"."ratio" AS ENUM('16:9', '9:16');--> statement-breakpoint
CREATE TYPE "public"."sound_kind" AS ENUM('sfx', 'ambient', 'music');--> statement-breakpoint
CREATE TYPE "public"."subtitle_style" AS ENUM('karaoke', 'fondant', 'cinematic');--> statement-breakpoint
CREATE TABLE "sound_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(200) NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" "sound_kind" NOT NULL,
	"mood" varchar(200),
	"loopable" boolean DEFAULT false NOT NULL,
	"duration_s" real,
	"musical_key" varchar(20),
	"bpm" integer,
	"impacts" jsonb,
	"usage" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shots" ALTER COLUMN "duration_s" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "narration" text;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "subtitle" text;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "audio_url" text;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "duration_source" "duration_source" DEFAULT 'estimated' NOT NULL;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "words" jsonb;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "render" jsonb;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "ratio" "ratio" DEFAULT '16:9' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "voice" varchar(60);--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "subtitles" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "subtitle_style" "subtitle_style" DEFAULT 'karaoke' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "music_url" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "music_volume" real DEFAULT 0.09 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "sfx_volume" real DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sound_assets_key_uq" ON "sound_assets" USING btree ("key");