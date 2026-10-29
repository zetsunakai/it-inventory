ALTER TABLE "ceisa_connections" ADD COLUMN "api_key_enc" text;
--> statement-breakpoint
SELECT enable_audit('ceisa_connections', 'environment', '{password_enc,api_key_enc,access_token_enc,refresh_token_enc}');
