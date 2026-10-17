CREATE TYPE "public"."customs_rule_target" AS ENUM('header', 'details', 'party', 'line', 'attachment', 'transport', 'package', 'container');--> statement-breakpoint
CREATE TABLE "doc_validation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_code" "customs_doc_code" NOT NULL,
	"target" "customs_rule_target" NOT NULL,
	"field" text NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_validation_rules_field_unique" UNIQUE("doc_code","target","field"),
	CONSTRAINT "doc_validation_rules_label_not_blank" CHECK (btrim("doc_validation_rules"."label") <> '')
);
