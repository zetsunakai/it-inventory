ALTER TABLE "ceisa_connections" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "ceisa_connections" ADD COLUMN "password_enc" text;
--> statement-breakpoint
SELECT enable_audit('ceisa_connections', 'environment', '{password_enc,access_token_enc,refresh_token_enc}');
