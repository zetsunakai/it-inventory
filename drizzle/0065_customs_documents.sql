CREATE TYPE "public"."customs_doc_code" AS ENUM('23', '40', '25', '30', '41');--> statement-breakpoint
CREATE TYPE "public"."customs_document_status" AS ENUM('draft', 'ready', 'submitted', 'registered', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "customs_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"document_type_code" text NOT NULL,
	"number" text,
	"date" date,
	"file_key" text,
	"file_name" text,
	"content_type" text,
	"file_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_attachments_seq_unique" UNIQUE("document_id","seq"),
	CONSTRAINT "customs_attachments_seq_positive" CHECK ("customs_attachments"."seq" >= 1),
	CONSTRAINT "customs_attachments_file_complete" CHECK (("customs_attachments"."file_key" is null) = ("customs_attachments"."file_name" is null)),
	CONSTRAINT "customs_attachments_file_size_positive" CHECK ("customs_attachments"."file_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "customs_containers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"number" text NOT NULL,
	"size_code" text,
	"type_code" text,
	"load_type_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_containers_seq_unique" UNIQUE("document_id","seq"),
	CONSTRAINT "customs_containers_number_unique" UNIQUE("document_id","number"),
	CONSTRAINT "customs_containers_seq_positive" CHECK ("customs_containers"."seq" >= 1),
	CONSTRAINT "customs_containers_number_not_blank" CHECK (btrim("customs_containers"."number") <> '')
);
--> statement-breakpoint
CREATE TABLE "customs_document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"item_code" text,
	"hs_code" text,
	"description" text,
	"brand" text,
	"item_type" text,
	"item_size" text,
	"specification" text,
	"category" "inventory_category" DEFAULT null NOT NULL,
	"qty" numeric(18, 4),
	"ceisa_unit_code" text,
	"stock_qty" numeric(18, 4),
	"package_qty" numeric(18, 4),
	"package_type_code" text,
	"net_weight" numeric(18, 4),
	"origin_country_code" text,
	"unit_price" numeric(18, 4),
	"invoice_value" numeric(18, 2),
	"cif_value" numeric(18, 2),
	"fob_value" numeric(18, 2),
	"freight_value" numeric(18, 2),
	"insurance_value" numeric(18, 2),
	"delivery_price" numeric(18, 2),
	"customs_value" numeric(18, 2),
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_document_lines_seq_unique" UNIQUE("document_id","seq"),
	CONSTRAINT "customs_document_lines_seq_positive" CHECK ("customs_document_lines"."seq" >= 1),
	CONSTRAINT "customs_document_lines_qty_positive" CHECK ("customs_document_lines"."qty" > 0 and "customs_document_lines"."stock_qty" > 0),
	CONSTRAINT "customs_document_lines_values_not_negative" CHECK ("customs_document_lines"."package_qty" >= 0 and "customs_document_lines"."net_weight" >= 0 and "customs_document_lines"."unit_price" >= 0
        and "customs_document_lines"."invoice_value" >= 0 and "customs_document_lines"."cif_value" >= 0 and "customs_document_lines"."fob_value" >= 0
        and "customs_document_lines"."freight_value" >= 0 and "customs_document_lines"."insurance_value" >= 0
        and "customs_document_lines"."delivery_price" >= 0 and "customs_document_lines"."customs_value" >= 0),
	CONSTRAINT "customs_document_lines_details_object" CHECK (jsonb_typeof("customs_document_lines"."details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "customs_document_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"entity_type_code" text NOT NULL,
	"partner_id" uuid,
	"name" text NOT NULL,
	"address" text,
	"country_code" text,
	"identity_type_code" text,
	"identity_number" text,
	"nib" text,
	"permit_number" text,
	"permit_date" date,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_document_parties_role_unique" UNIQUE("document_id","entity_type_code"),
	CONSTRAINT "customs_document_parties_name_not_blank" CHECK (btrim("customs_document_parties"."name") <> ''),
	CONSTRAINT "customs_document_parties_details_object" CHECK (jsonb_typeof("customs_document_parties"."details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "customs_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_code" "customs_doc_code" NOT NULL,
	"status" "customs_document_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"aju_number" text,
	"aju_date" date,
	"customs_office_code" text,
	"registration_number" text,
	"registration_date" date,
	"response_code" text,
	"response_number" text,
	"response_date" date,
	"currency_code" text,
	"ndpbm" numeric(18, 4),
	"cif_value" numeric(18, 2),
	"fob_value" numeric(18, 2),
	"freight_value" numeric(18, 2),
	"insurance_value" numeric(18, 2),
	"delivery_price" numeric(18, 2),
	"gross_weight" numeric(18, 4),
	"net_weight" numeric(18, 4),
	"signer_name" text,
	"signer_position" text,
	"signer_city" text,
	"signed_date" date,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_documents_aju_number_unique" UNIQUE("aju_number"),
	CONSTRAINT "customs_documents_version_positive" CHECK ("customs_documents"."version" >= 1),
	CONSTRAINT "customs_documents_details_object" CHECK (jsonb_typeof("customs_documents"."details") = 'object'),
	CONSTRAINT "customs_documents_registered_has_number" CHECK ("customs_documents"."status" <> 'registered' or ("customs_documents"."registration_number" is not null and "customs_documents"."registration_date" is not null)),
	CONSTRAINT "customs_documents_cancelled_has_date" CHECK (("customs_documents"."status" = 'cancelled') = ("customs_documents"."cancelled_at" is not null)),
	CONSTRAINT "customs_documents_ndpbm_positive" CHECK ("customs_documents"."ndpbm" > 0),
	CONSTRAINT "customs_documents_values_not_negative" CHECK ("customs_documents"."cif_value" >= 0 and "customs_documents"."fob_value" >= 0 and "customs_documents"."freight_value" >= 0
        and "customs_documents"."insurance_value" >= 0 and "customs_documents"."delivery_price" >= 0
        and "customs_documents"."gross_weight" >= 0 and "customs_documents"."net_weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customs_line_taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"levy_type_code" text NOT NULL,
	"rate" numeric(18, 4),
	"facility_code" text,
	"facility_rate" numeric(18, 4),
	"amount" numeric(18, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_line_taxes_levy_unique" UNIQUE("line_id","levy_type_code"),
	CONSTRAINT "customs_line_taxes_not_negative" CHECK ("customs_line_taxes"."rate" >= 0 and "customs_line_taxes"."facility_rate" >= 0 and "customs_line_taxes"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customs_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"package_type_code" text NOT NULL,
	"marks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_packages_seq_unique" UNIQUE("document_id","seq"),
	CONSTRAINT "customs_packages_seq_positive" CHECK ("customs_packages"."seq" >= 1),
	CONSTRAINT "customs_packages_qty_positive" CHECK ("customs_packages"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "customs_transports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"transport_mode_code" text,
	"name" text,
	"voyage_number" text,
	"flag_country_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_transports_seq_unique" UNIQUE("document_id","seq"),
	CONSTRAINT "customs_transports_seq_positive" CHECK ("customs_transports"."seq" >= 1)
);
--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "customs_document_line_id" uuid;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "customs_document_id" uuid;--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD CONSTRAINT "customs_attachments_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_containers" ADD CONSTRAINT "customs_containers_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_document_lines" ADD CONSTRAINT "customs_document_lines_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_document_lines" ADD CONSTRAINT "customs_document_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_document_parties" ADD CONSTRAINT "customs_document_parties_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_document_parties" ADD CONSTRAINT "customs_document_parties_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_line_taxes" ADD CONSTRAINT "customs_line_taxes_line_id_customs_document_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."customs_document_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_packages" ADD CONSTRAINT "customs_packages_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_transports" ADD CONSTRAINT "customs_transports_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customs_attachments_type_idx" ON "customs_attachments" USING btree ("document_id","document_type_code");--> statement-breakpoint
CREATE INDEX "customs_document_lines_product_idx" ON "customs_document_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "customs_document_parties_partner_idx" ON "customs_document_parties" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "customs_documents_doc_code_status_idx" ON "customs_documents" USING btree ("doc_code","status");--> statement-breakpoint
CREATE INDEX "customs_documents_registration_idx" ON "customs_documents" USING btree ("doc_code","registration_number");--> statement-breakpoint
CREATE INDEX "customs_documents_aju_date_idx" ON "customs_documents" USING btree ("aju_date");--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_customs_document_line_id_customs_document_lines_id_fk" FOREIGN KEY ("customs_document_line_id") REFERENCES "public"."customs_document_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_customs_document_id_customs_documents_id_fk" FOREIGN KEY ("customs_document_id") REFERENCES "public"."customs_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_moves_customs_document_line_idx" ON "stock_moves" USING btree ("customs_document_line_id");--> statement-breakpoint
CREATE INDEX "transfers_customs_document_idx" ON "transfers" USING btree ("customs_document_id");