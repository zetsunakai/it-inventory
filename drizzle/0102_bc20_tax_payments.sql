ALTER TABLE "customs_document_taxes" ADD COLUMN "paid_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "customs_document_taxes" ADD COLUMN "government_borne_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "customs_document_taxes" ADD COLUMN "deferred_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "customs_document_taxes" ADD COLUMN "not_collected_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "customs_document_taxes" ADD COLUMN "exempted_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "customs_document_taxes" ADD COLUMN "settled_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "customs_document_taxes" ADD CONSTRAINT "customs_document_taxes_payments_not_negative" CHECK (
      coalesce("customs_document_taxes"."paid_amount", 0) >= 0 and coalesce("customs_document_taxes"."government_borne_amount", 0) >= 0
      and coalesce("customs_document_taxes"."deferred_amount", 0) >= 0 and coalesce("customs_document_taxes"."not_collected_amount", 0) >= 0
      and coalesce("customs_document_taxes"."exempted_amount", 0) >= 0 and coalesce("customs_document_taxes"."settled_amount", 0) >= 0);