CREATE TYPE "public"."stock_count_status" AS ENUM('counting', 'review', 'approved', 'cancelled');--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_count_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"lot_id" uuid,
	"system_qty" numeric(18, 4),
	"counted_qty" numeric(18, 4),
	"counted_by" uuid,
	"counted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_count_lines_item_unique" UNIQUE NULLS NOT DISTINCT("stock_count_id","product_id","location_id","lot_id"),
	CONSTRAINT "stock_count_lines_qty_not_negative" CHECK (("stock_count_lines"."counted_qty" is null or "stock_count_lines"."counted_qty" >= 0))
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"location_id" uuid,
	"cut_off_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "stock_count_status" DEFAULT 'counting' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_counts_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "stock_count_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_count_lines_count_idx" ON "stock_count_lines" USING btree ("stock_count_id");--> statement-breakpoint
CREATE INDEX "stock_counts_warehouse_idx" ON "stock_counts" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "stock_counts_status_idx" ON "stock_counts" USING btree ("status");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfers_stock_count_idx" ON "transfers" USING btree ("stock_count_id");