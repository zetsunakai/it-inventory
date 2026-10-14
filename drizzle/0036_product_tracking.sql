CREATE TYPE "public"."product_tracking" AS ENUM('none', 'lot', 'serial');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tracking" "product_tracking" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lot_prefix" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lot_digits" smallint DEFAULT 6 NOT NULL;