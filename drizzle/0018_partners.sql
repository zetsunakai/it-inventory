CREATE TYPE "public"."identity_type" AS ENUM('npwp16', 'npwp15', 'passport', 'ktp', 'other');--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"country_code" text NOT NULL,
	"is_vendor" boolean NOT NULL,
	"is_customer" boolean NOT NULL,
	"identity_type" "identity_type" NOT NULL,
	"identity_number" text NOT NULL,
	"nitku" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE INDEX "partners_name_idx" ON "partners" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_nitku_unique" ON "partners" USING btree ("nitku") WHERE "partners"."nitku" is not null;