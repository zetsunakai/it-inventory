CREATE TABLE "transfer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"product_id" uuid NOT NULL,
	"input_qty" numeric(18, 4) NOT NULL,
	"input_uom_id" uuid NOT NULL,
	"qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"done_qty" numeric(18, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_lines_qty_positive" CHECK ("transfer_lines"."input_qty" > 0 and "transfer_lines"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "line_id" uuid;--> statement-breakpoint
-- Data lama (backlog R-05): setiap baris pergerakan mendapat satu baris permintaan dengan qty yang
-- sama (id sama supaya mudah ditelusuri). Baris Selesai terkunci trigger, jadi trigger dimatikan
-- sementara di transaksi migrasi ini saja.
INSERT INTO "transfer_lines" (
  "id", "transfer_id", "position", "product_id", "input_qty", "input_uom_id", "qty", "done_qty",
  "created_at", "updated_at"
)
SELECT "id", "transfer_id", "position", "product_id", "input_qty", "input_uom_id", "qty",
  CASE WHEN "status" = 'done' THEN "qty" END, "created_at", "updated_at"
FROM "stock_moves";--> statement-breakpoint
ALTER TABLE "stock_moves" DISABLE TRIGGER USER;--> statement-breakpoint
UPDATE "stock_moves" SET "line_id" = "id";--> statement-breakpoint
ALTER TABLE "stock_moves" ENABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE "stock_moves" ALTER COLUMN "line_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_input_uom_id_uoms_id_fk" FOREIGN KEY ("input_uom_id") REFERENCES "public"."uoms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfer_lines_transfer_idx" ON "transfer_lines" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "transfer_lines_product_idx" ON "transfer_lines" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_line_id_transfer_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."transfer_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_moves_line_idx" ON "stock_moves" USING btree ("line_id");