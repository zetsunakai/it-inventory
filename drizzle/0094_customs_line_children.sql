ALTER TABLE "customs_document_lines" ADD COLUMN "raw_materials" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_document_lines" ADD COLUMN "entities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_document_lines" ADD COLUMN "duties" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_document_lines" ADD CONSTRAINT "customs_document_lines_raw_materials_array" CHECK (jsonb_typeof("customs_document_lines"."raw_materials") = 'array');--> statement-breakpoint
ALTER TABLE "customs_document_lines" ADD CONSTRAINT "customs_document_lines_entities_array" CHECK (jsonb_typeof("customs_document_lines"."entities") = 'array');--> statement-breakpoint
ALTER TABLE "customs_document_lines" ADD CONSTRAINT "customs_document_lines_duties_array" CHECK (jsonb_typeof("customs_document_lines"."duties") = 'array');