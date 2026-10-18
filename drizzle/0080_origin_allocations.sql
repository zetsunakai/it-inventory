CREATE TABLE "origin_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"out_line_id" uuid NOT NULL,
	"origin_line_id" uuid NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "origin_allocations_pair_unique" UNIQUE("out_line_id","origin_line_id"),
	CONSTRAINT "origin_allocations_qty_positive" CHECK ("origin_allocations"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "origin_allocations" ADD CONSTRAINT "origin_allocations_out_line_id_customs_document_lines_id_fk" FOREIGN KEY ("out_line_id") REFERENCES "public"."customs_document_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "origin_allocations" ADD CONSTRAINT "origin_allocations_origin_line_id_customs_document_lines_id_fk" FOREIGN KEY ("origin_line_id") REFERENCES "public"."customs_document_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "origin_allocations_origin_idx" ON "origin_allocations" USING btree ("origin_line_id");