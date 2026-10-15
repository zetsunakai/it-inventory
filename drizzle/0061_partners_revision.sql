-- Revisi master partner (backlog RM-03): peran vendor/customer dihapus (semua partner bisa dipilih
-- di penerimaan dan pengiriman), kode partner dibuat database dan tidak ditampilkan lagi.
CREATE SEQUENCE IF NOT EXISTS partners_code_seq;--> statement-breakpoint
-- Lewati kode PRT-nnnnnn yang mungkin sudah dipakai partner lama.
SELECT setval('partners_code_seq', coalesce(
  (SELECT max(substring(code FROM '^PRT-([0-9]+)$')::bigint) FROM partners), 0
) + 1, false);--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "code" SET DEFAULT ('PRT-' || lpad(nextval('partners_code_seq')::text, 6, '0'));--> statement-breakpoint
CREATE INDEX "partners_identity_number_idx" ON "partners" USING btree ("identity_number");--> statement-breakpoint
ALTER TABLE "partners" DROP CONSTRAINT IF EXISTS partners_has_role;--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "is_vendor";--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "is_customer";
