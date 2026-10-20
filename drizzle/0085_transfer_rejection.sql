ALTER TYPE "public"."transfer_status" ADD VALUE 'rejected' BEFORE 'done';--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "rejected_by" uuid;