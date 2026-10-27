ALTER TABLE "customs_attachments" DROP CONSTRAINT "customs_attachments_seq_unique";--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD COLUMN "material_seq" integer;--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD CONSTRAINT "customs_attachments_seq_unique" UNIQUE NULLS NOT DISTINCT("document_id","line_id","material_seq","seq");