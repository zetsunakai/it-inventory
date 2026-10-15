ALTER TYPE "public"."stock_count_status" ADD VALUE 'draft' BEFORE 'counting';--> statement-breakpoint
ALTER TYPE "public"."stock_count_status" ADD VALUE 'counted' BEFORE 'review';--> statement-breakpoint
ALTER TABLE "stock_counts" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD COLUMN "product_category_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_product_category_id_product_categories_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;