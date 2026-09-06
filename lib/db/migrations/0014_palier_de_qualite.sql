CREATE TYPE "public"."quality" AS ENUM('draft', 'standard');--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "quality" "quality" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
--> La conversion, ajoutee a la main : drizzle-kit posait la colonne puis
--> supprimait l'ancienne, donc toute video deja en 720p serait retombee sur
--> le defaut 'draft'. Elle aurait ete facturee 7 credits la seconde et rendue
--> en mode brouillon, sans que rien ne le signale.
UPDATE "videos" SET "quality" = CASE
  WHEN "resolution" = '720p' THEN 'standard'::"public"."quality"
  ELSE 'draft'::"public"."quality"
END;--> statement-breakpoint
ALTER TABLE "videos" DROP COLUMN "resolution";--> statement-breakpoint
DROP TYPE "public"."resolution";
