ALTER TABLE "customs_documents" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customs_documents" ADD COLUMN "rejection_reason" text;