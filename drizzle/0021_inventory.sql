CREATE TYPE "public"."stock_move_status" AS ENUM('draft', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('draft', 'ready', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transfer_type" AS ENUM('receipt', 'delivery', 'internal', 'return', 'scrap', 'adjustment');--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lots_product_name_unique" UNIQUE("product_id","name"),
	CONSTRAINT "lots_name_not_blank" CHECK (btrim("lots"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "number_sequences" (
	"scope" text NOT NULL,
	"period" text NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "number_sequences_scope_period_pk" PRIMARY KEY("scope","period")
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"lot_id" uuid,
	"warehouse_id" uuid,
	"qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balances_product_location_lot_unique" UNIQUE NULLS NOT DISTINCT("product_id","location_id","lot_id")
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid,
	"status" "stock_move_status" DEFAULT 'draft' NOT NULL,
	"input_qty" numeric(18, 4) NOT NULL,
	"input_uom_id" uuid NOT NULL,
	"qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"source_location_id" uuid NOT NULL,
	"destination_location_id" uuid NOT NULL,
	"source_warehouse_id" uuid,
	"destination_warehouse_id" uuid,
	"category" "inventory_category",
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_moves_qty_positive" CHECK ("stock_moves"."input_qty" > 0 and "stock_moves"."qty" > 0),
	CONSTRAINT "stock_moves_locations_differ" CHECK ("stock_moves"."source_location_id" <> "stock_moves"."destination_location_id"),
	CONSTRAINT "stock_moves_done_complete" CHECK ("stock_moves"."status" <> 'done' or ("stock_moves"."done_at" is not null and "stock_moves"."category" is not null))
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"type" "transfer_type" NOT NULL,
	"status" "transfer_status" DEFAULT 'draft' NOT NULL,
	"source_location_id" uuid NOT NULL,
	"destination_location_id" uuid NOT NULL,
	"partner_id" uuid,
	"scheduled_date" date,
	"reference" text,
	"notes" text,
	"reason" text,
	"return_of_id" uuid,
	"backorder_of_id" uuid,
	"done_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_by" uuid,
	"approved_by" uuid,
	"done_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_number_unique" UNIQUE("number"),
	CONSTRAINT "transfers_locations_differ" CHECK ("transfers"."source_location_id" <> "transfers"."destination_location_id"),
	CONSTRAINT "transfers_done_has_date" CHECK (("transfers"."status" = 'done') = ("transfers"."done_at" is not null)),
	CONSTRAINT "transfers_cancelled_has_date" CHECK (("transfers"."status" = 'cancelled') = ("transfers"."cancelled_at" is not null)),
	CONSTRAINT "transfers_partner_required" CHECK ("transfers"."type" not in ('receipt', 'delivery', 'return') or "transfers"."partner_id" is not null),
	CONSTRAINT "transfers_return_has_origin" CHECK (("transfers"."type" = 'return') = ("transfers"."return_of_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_input_uom_id_uoms_id_fk" FOREIGN KEY ("input_uom_id") REFERENCES "public"."uoms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_source_location_id_locations_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_destination_location_id_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_source_location_id_locations_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_location_id_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_return_of_id_transfers_id_fk" FOREIGN KEY ("return_of_id") REFERENCES "public"."transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_backorder_of_id_transfers_id_fk" FOREIGN KEY ("backorder_of_id") REFERENCES "public"."transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_balances_location_idx" ON "stock_balances" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "stock_balances_warehouse_idx" ON "stock_balances" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "stock_moves_transfer_idx" ON "stock_moves" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "stock_moves_product_done_at_idx" ON "stock_moves" USING btree ("product_id","done_at");--> statement-breakpoint
CREATE INDEX "stock_moves_lot_idx" ON "stock_moves" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "stock_moves_source_location_idx" ON "stock_moves" USING btree ("source_location_id");--> statement-breakpoint
CREATE INDEX "stock_moves_destination_location_idx" ON "stock_moves" USING btree ("destination_location_id");--> statement-breakpoint
CREATE INDEX "stock_moves_source_warehouse_done_at_idx" ON "stock_moves" USING btree ("source_warehouse_id","done_at");--> statement-breakpoint
CREATE INDEX "stock_moves_destination_warehouse_done_at_idx" ON "stock_moves" USING btree ("destination_warehouse_id","done_at");--> statement-breakpoint
CREATE INDEX "transfers_type_status_idx" ON "transfers" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "transfers_source_location_idx" ON "transfers" USING btree ("source_location_id");--> statement-breakpoint
CREATE INDEX "transfers_destination_location_idx" ON "transfers" USING btree ("destination_location_id");--> statement-breakpoint
CREATE INDEX "transfers_partner_idx" ON "transfers" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "transfers_return_of_idx" ON "transfers" USING btree ("return_of_id");--> statement-breakpoint
CREATE INDEX "transfers_backorder_of_idx" ON "transfers" USING btree ("backorder_of_id");--> statement-breakpoint
CREATE INDEX "transfers_done_at_idx" ON "transfers" USING btree ("done_at");