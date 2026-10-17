CREATE TABLE "customs_document_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_document_revisions_version_unique" UNIQUE("document_id","version"),
	CONSTRAINT "customs_document_revisions_reason_not_blank" CHECK (btrim("customs_document_revisions"."reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "customs_document_revisions" ADD CONSTRAINT "customs_document_revisions_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;