CREATE TABLE "ceisa_connections" (
	"environment" text PRIMARY KEY NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"authenticated_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_outcome" text NOT NULL,
	"last_message" text,
	"last_http_status" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
