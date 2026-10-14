ALTER TABLE "uoms" DROP CONSTRAINT "uoms_code_unique";--> statement-breakpoint
ALTER TABLE "uoms" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "uoms" ADD COLUMN "rounding" numeric(18, 4) DEFAULT '0.0001' NOT NULL;--> statement-breakpoint
ALTER TABLE "uoms" ADD CONSTRAINT "uoms_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uoms_code_global_unique" ON "uoms" USING btree ("code") WHERE "uoms"."product_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uoms_code_product_unique" ON "uoms" USING btree ("product_id","code") WHERE "uoms"."product_id" is not null;