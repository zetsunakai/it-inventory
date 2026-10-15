CREATE TYPE "public"."return_line_action" AS ENUM('return', 'replace');--> statement-breakpoint
CREATE TYPE "public"."return_request_status" AS ENUM('draft', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."return_request_type" AS ENUM('vendor', 'customer');--> statement-breakpoint
CREATE TABLE "return_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_request_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid,
	"qty" numeric(18, 4) NOT NULL,
	"action" "return_line_action" DEFAULT 'return' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_request_lines_product_lot_unique" UNIQUE NULLS NOT DISTINCT("return_request_id","product_id","lot_id"),
	CONSTRAINT "return_request_lines_qty_positive" CHECK ("return_request_lines"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "return_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"type" "return_request_type" NOT NULL,
	"status" "return_request_status" DEFAULT 'draft' NOT NULL,
	"origin_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"scheduled_date" date,
	"reason" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_requests_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "return_request_id" uuid;--> statement-breakpoint
ALTER TABLE "return_request_lines" ADD CONSTRAINT "return_request_lines_return_request_id_return_requests_id_fk" FOREIGN KEY ("return_request_id") REFERENCES "public"."return_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_request_lines" ADD CONSTRAINT "return_request_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_request_lines" ADD CONSTRAINT "return_request_lines_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_origin_id_transfers_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_requests_origin_idx" ON "return_requests" USING btree ("origin_id");--> statement-breakpoint
CREATE INDEX "return_requests_status_idx" ON "return_requests" USING btree ("status");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_return_request_id_return_requests_id_fk" FOREIGN KEY ("return_request_id") REFERENCES "public"."return_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfers_return_request_idx" ON "transfers" USING btree ("return_request_id");