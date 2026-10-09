ALTER TYPE "public"."ref_code_type" ADD VALUE 'hs_code';--> statement-breakpoint
ALTER TYPE "public"."ref_code_type" ADD VALUE 'ceisa_unit';--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "inventory_category" NOT NULL,
	"uom_id" uuid NOT NULL,
	"hs_code" text,
	"ceisa_unit_code" text,
	"ceisa_factor" numeric(24, 10),
	"net_weight" numeric(18, 6),
	"brand" text,
	"model" text,
	"size" text,
	"lot_required" boolean DEFAULT false NOT NULL,
	"customs_ready" boolean GENERATED ALWAYS AS (hs_code is not null and ceisa_unit_code is not null and ceisa_factor is not null) STORED NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_uom_id_uoms_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uoms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");