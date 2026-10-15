ALTER TYPE "public"."transfer_status" ADD VALUE 'waiting' BEFORE 'ready';--> statement-breakpoint
ALTER TYPE "public"."transfer_status" ADD VALUE 'partially_available' BEFORE 'ready';