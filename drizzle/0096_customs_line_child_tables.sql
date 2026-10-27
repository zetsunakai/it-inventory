CREATE TABLE "customs_line_duties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"levy_code" text NOT NULL,
	"tax_type_code" text,
	"rate_type_code" text,
	"rate" numeric(18, 4),
	"exempt_amount" numeric(18, 2),
	"facility_code" text,
	"paid_amount" numeric(18, 2),
	"bmt" boolean DEFAULT false NOT NULL,
	"excise" boolean DEFAULT false NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_line_duties_seq_unique" UNIQUE("line_id","seq"),
	CONSTRAINT "customs_line_duties_seq_positive" CHECK ("customs_line_duties"."seq" >= 1),
	CONSTRAINT "customs_line_duties_levy_valid" CHECK ("customs_line_duties"."levy_code" in ('bm', 'ppn', 'ppnbm', 'pph', 'cukai', 'other')),
	CONSTRAINT "customs_line_duties_values_non_negative" CHECK ("customs_line_duties"."rate" >= 0 and "customs_line_duties"."exempt_amount" >= 0 and "customs_line_duties"."paid_amount" >= 0),
	CONSTRAINT "customs_line_duties_details_object" CHECK (jsonb_typeof("customs_line_duties"."details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "customs_line_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"entity_type_code" text NOT NULL,
	"partner_id" uuid,
	"name" text NOT NULL,
	"address" text,
	"identity_number" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_line_entities_seq_unique" UNIQUE("line_id","seq"),
	CONSTRAINT "customs_line_entities_seq_positive" CHECK ("customs_line_entities"."seq" >= 1),
	CONSTRAINT "customs_line_entities_name_not_blank" CHECK (btrim("customs_line_entities"."name") <> ''),
	CONSTRAINT "customs_line_entities_details_object" CHECK (jsonb_typeof("customs_line_entities"."details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "customs_line_raw_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"origin_code" text,
	"product_serial" text,
	"product_code" text,
	"hs_code" text,
	"description" text,
	"quantity" numeric(18, 4),
	"unit_code" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_line_raw_materials_seq_unique" UNIQUE("line_id","seq"),
	CONSTRAINT "customs_line_raw_materials_seq_positive" CHECK ("customs_line_raw_materials"."seq" >= 1),
	CONSTRAINT "customs_line_raw_materials_quantity_positive" CHECK ("customs_line_raw_materials"."quantity" > 0),
	CONSTRAINT "customs_line_raw_materials_details_object" CHECK (jsonb_typeof("customs_line_raw_materials"."details") = 'object')
);
--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD COLUMN "material_id" uuid;--> statement-breakpoint
ALTER TABLE "customs_line_duties" ADD CONSTRAINT "customs_line_duties_line_id_customs_document_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."customs_document_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_line_entities" ADD CONSTRAINT "customs_line_entities_line_id_customs_document_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."customs_document_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_line_entities" ADD CONSTRAINT "customs_line_entities_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_line_raw_materials" ADD CONSTRAINT "customs_line_raw_materials_line_id_customs_document_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."customs_document_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD CONSTRAINT "customs_attachments_material_id_customs_line_raw_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."customs_line_raw_materials"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "customs_line_raw_materials" ("line_id", "seq", "origin_code", "product_serial", "product_code", "hs_code", "description", "quantity", "unit_code", "details")
SELECT l."id", entry.ordinality::integer, nullif(entry.value ->> 'originCode', ''), nullif(entry.value ->> 'productSerial', ''), nullif(entry.value ->> 'productCode', ''), nullif(entry.value ->> 'hsCode', ''), nullif(entry.value ->> 'description', ''),
  CASE WHEN (entry.value ->> 'quantity') ~ '^[0-9]+(\.[0-9]+)?$' AND (entry.value ->> 'quantity')::numeric > 0 THEN (entry.value ->> 'quantity')::numeric ELSE NULL END,
  nullif(entry.value ->> 'unitCode', ''), coalesce(entry.value -> 'details', '{}'::jsonb)
FROM "customs_document_lines" l
CROSS JOIN LATERAL jsonb_array_elements(l."raw_materials") WITH ORDINALITY AS entry(value, ordinality)
ON CONFLICT ("line_id", "seq") DO NOTHING;
--> statement-breakpoint
INSERT INTO "customs_line_entities" ("line_id", "seq", "entity_type_code", "partner_id", "name", "address", "identity_number", "details")
SELECT l."id", entry.ordinality::integer, coalesce(nullif(entry.value ->> 'entityTypeCode', ''), 'other'), nullif(entry.value ->> 'partnerId', '')::uuid, btrim(entry.value ->> 'name'), nullif(entry.value ->> 'address', ''), nullif(entry.value ->> 'identityNumber', ''), coalesce(entry.value -> 'details', '{}'::jsonb)
FROM "customs_document_lines" l
CROSS JOIN LATERAL jsonb_array_elements(l."entities") WITH ORDINALITY AS entry(value, ordinality)
WHERE nullif(btrim(entry.value ->> 'name'), '') IS NOT NULL
ON CONFLICT ("line_id", "seq") DO NOTHING;
--> statement-breakpoint
INSERT INTO "customs_line_duties" ("line_id", "seq", "levy_code", "tax_type_code", "rate_type_code", "rate", "exempt_amount", "facility_code", "paid_amount", "bmt", "excise", "details")
SELECT l."id", entry.ordinality::integer,
  CASE WHEN entry.value ->> 'levyCode' IN ('bm', 'ppn', 'ppnbm', 'pph', 'cukai', 'other') THEN entry.value ->> 'levyCode' ELSE 'other' END,
  nullif(entry.value ->> 'taxTypeCode', ''), nullif(entry.value ->> 'rateTypeCode', ''),
  CASE WHEN (entry.value ->> 'rate') ~ '^[0-9]+(\.[0-9]+)?$' THEN (entry.value ->> 'rate')::numeric ELSE NULL END,
  CASE WHEN (entry.value ->> 'exemptAmount') ~ '^[0-9]+(\.[0-9]+)?$' THEN (entry.value ->> 'exemptAmount')::numeric ELSE NULL END,
  nullif(entry.value ->> 'facilityCode', ''),
  CASE WHEN (entry.value ->> 'paidAmount') ~ '^[0-9]+(\.[0-9]+)?$' THEN (entry.value ->> 'paidAmount')::numeric ELSE NULL END,
  coalesce((entry.value ->> 'bmt')::boolean, false), coalesce((entry.value ->> 'excise')::boolean, false), coalesce(entry.value -> 'details', '{}'::jsonb)
FROM "customs_document_lines" l
CROSS JOIN LATERAL jsonb_array_elements(l."duties") WITH ORDINALITY AS entry(value, ordinality)
ON CONFLICT ("line_id", "seq") DO NOTHING;
--> statement-breakpoint
UPDATE "customs_attachments" a
SET "material_id" = m."id"
FROM "customs_line_raw_materials" m
WHERE a."line_id" = m."line_id" AND a."material_seq" = m."seq" AND a."material_seq" IS NOT NULL;
