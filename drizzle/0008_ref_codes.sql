CREATE TYPE "public"."ref_code_type" AS ENUM('document_type', 'customs_office', 'domestic_port', 'foreign_port', 'tps', 'country', 'currency', 'package_type', 'container_size', 'container_type', 'facility', 'levy_type', 'incoterm', 'transport_mode', 'entity_type', 'response');--> statement-breakpoint
CREATE TABLE "ref_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "ref_code_type" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ref_codes_type_parent_code_code_key" UNIQUE NULLS NOT DISTINCT("type","parent_code","code")
);
--> statement-breakpoint
CREATE INDEX "ref_codes_type_code_idx" ON "ref_codes" USING btree ("type","code");