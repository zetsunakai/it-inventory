CREATE TYPE "public"."interwarehouse_status" AS ENUM('draft', 'confirmed', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "interwarehouse_transfer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interwarehouse_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid,
	"input_qty" numeric(18, 4) NOT NULL,
	"input_uom_id" uuid NOT NULL,
	"qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interwarehouse_transfer_lines_qty_positive" CHECK ("interwarehouse_transfer_lines"."input_qty" > 0 and "interwarehouse_transfer_lines"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "interwarehouse_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"status" "interwarehouse_status" DEFAULT 'draft' NOT NULL,
	"source_location_id" uuid NOT NULL,
	"destination_location_id" uuid NOT NULL,
	"transit_location_id" uuid NOT NULL,
	"scheduled_date" date,
	"reference" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interwarehouse_transfers_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "interwarehouse_id" uuid;--> statement-breakpoint
ALTER TABLE "interwarehouse_transfer_lines" ADD CONSTRAINT "interwarehouse_transfer_lines_interwarehouse_id_interwarehouse_transfers_id_fk" FOREIGN KEY ("interwarehouse_id") REFERENCES "public"."interwarehouse_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interwarehouse_transfer_lines" ADD CONSTRAINT "interwarehouse_transfer_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interwarehouse_transfer_lines" ADD CONSTRAINT "interwarehouse_transfer_lines_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interwarehouse_transfer_lines" ADD CONSTRAINT "interwarehouse_transfer_lines_input_uom_id_uoms_id_fk" FOREIGN KEY ("input_uom_id") REFERENCES "public"."uoms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interwarehouse_transfers" ADD CONSTRAINT "interwarehouse_transfers_source_location_id_locations_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interwarehouse_transfers" ADD CONSTRAINT "interwarehouse_transfers_destination_location_id_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interwarehouse_transfers" ADD CONSTRAINT "interwarehouse_transfers_transit_location_id_locations_id_fk" FOREIGN KEY ("transit_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interwarehouse_transfer_lines_request_idx" ON "interwarehouse_transfer_lines" USING btree ("interwarehouse_id");--> statement-breakpoint
CREATE INDEX "interwarehouse_transfers_status_idx" ON "interwarehouse_transfers" USING btree ("status");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_interwarehouse_id_interwarehouse_transfers_id_fk" FOREIGN KEY ("interwarehouse_id") REFERENCES "public"."interwarehouse_transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfers_interwarehouse_idx" ON "transfers" USING btree ("interwarehouse_id");