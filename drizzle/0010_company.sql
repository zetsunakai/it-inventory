CREATE TYPE "public"."facility_type" AS ENUM('kawasan_berikat', 'plb', 'kite');--> statement-breakpoint
CREATE TABLE "company" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"npwp" text NOT NULL,
	"nitku" text NOT NULL,
	"nib" text NOT NULL,
	"facility_type" "facility_type" NOT NULL,
	"permit_number" text NOT NULL,
	"permit_date" date NOT NULL,
	"supervising_office_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
