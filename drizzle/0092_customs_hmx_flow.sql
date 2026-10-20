-- Dokumen BC ikut hmx-002 (backlog H-01, H-02; PRD 7.3–7.6, 8): status Draft → Submitted, nomor
-- urut IT/<kode>/<urut>, No. Aju manual, transfer dipilih di dokumen (many-to-many), tanpa gerbang
-- validasi transfer, tanpa revisi, dan tanpa alokasi dokumen asal. Bagian awal melepas fungsi,
-- trigger, dan view lama yang bergantung pada status atau kolom yang dihapus, lalu memindahkan data;
-- aturan barunya di migrasi berikutnya (customs_hmx_flow_rules).
DROP VIEW IF EXISTS customs_origin_balances;--> statement-breakpoint
DROP TRIGGER customs_documents_before_write ON customs_documents;--> statement-breakpoint
DROP TRIGGER customs_attachments_guard ON customs_attachments;--> statement-breakpoint
DROP TRIGGER customs_bank_accounts_guard ON customs_bank_accounts;--> statement-breakpoint
DROP TRIGGER customs_containers_guard ON customs_containers;--> statement-breakpoint
DROP TRIGGER customs_document_lines_guard ON customs_document_lines;--> statement-breakpoint
DROP TRIGGER customs_document_lines_link_moves ON customs_document_lines;--> statement-breakpoint
DROP TRIGGER customs_document_lines_release_moves ON customs_document_lines;--> statement-breakpoint
DROP TRIGGER customs_document_parties_guard ON customs_document_parties;--> statement-breakpoint
DROP TRIGGER customs_document_taxes_guard ON customs_document_taxes;--> statement-breakpoint
DROP TRIGGER customs_guarantees_guard ON customs_guarantees;--> statement-breakpoint
DROP TRIGGER customs_packages_guard ON customs_packages;--> statement-breakpoint
DROP TRIGGER customs_transports_guard ON customs_transports;--> statement-breakpoint
DROP TRIGGER stock_moves_customs_line_fill ON stock_moves;--> statement-breakpoint
DROP TRIGGER stock_moves_customs_link_check ON stock_moves;--> statement-breakpoint
DROP TRIGGER transfers_customs_link_check ON transfers;--> statement-breakpoint
DROP TRIGGER transfers_inherit_customs_document ON transfers;--> statement-breakpoint
DROP FUNCTION refresh_customs_document_status(uuid);--> statement-breakpoint
DROP FUNCTION customs_document_locked(customs_document_status);--> statement-breakpoint
DROP FUNCTION customs_status_label(customs_document_status);--> statement-breakpoint
DROP FUNCTION submit_customs_document(uuid);--> statement-breakpoint
DROP FUNCTION register_customs_document(uuid, text, date, text, text, date);--> statement-breakpoint
DROP FUNCTION reject_customs_document(uuid, text, text, text, date);--> statement-breakpoint
DROP FUNCTION reset_customs_document_to_draft(uuid);--> statement-breakpoint
DROP FUNCTION cancel_customs_document(uuid);--> statement-breakpoint
DROP FUNCTION revise_customs_document(uuid, text);--> statement-breakpoint
DROP FUNCTION customs_document_snapshot(uuid);--> statement-breakpoint
DROP FUNCTION customs_document_lines_link_moves();--> statement-breakpoint
DROP FUNCTION customs_document_lines_release_moves();--> statement-breakpoint
DROP FUNCTION stock_moves_customs_line_fill();--> statement-breakpoint
DROP FUNCTION stock_moves_customs_link_check();--> statement-breakpoint
DROP FUNCTION transfers_customs_link_check();--> statement-breakpoint
DROP FUNCTION transfers_inherit_customs_document();--> statement-breakpoint
DROP FUNCTION customs_line_for(uuid, uuid);--> statement-breakpoint
-- Tautan dokumen ↔ transfer lama disimpan dulu (dokumen Batal tidak ikut), dipindahkan ke tabel
-- many-to-many setelah kolomnya dihapus.
CREATE TEMPORARY TABLE customs_links_old ON COMMIT DROP AS
  SELECT t.customs_document_id AS document_id, t.id AS transfer_id
  FROM transfers t JOIN customs_documents d ON d.id = t.customs_document_id
  WHERE d.status::text <> 'cancelled';--> statement-breakpoint
-- Pergerakan Selesai dikunci trigger ledger; penanda ini mengizinkan pembersihan kolom tautannya.
SELECT set_config('app.ledger_write', 'on', true);--> statement-breakpoint
UPDATE stock_moves SET customs_document_line_id = NULL WHERE customs_document_line_id IS NOT NULL;--> statement-breakpoint
UPDATE transfers SET customs_document_id = NULL WHERE customs_document_id IS NOT NULL;--> statement-breakpoint
SELECT set_config('app.ledger_write', '', true);--> statement-breakpoint
DELETE FROM origin_allocations;--> statement-breakpoint
-- Status lama → hmx: Diajukan/Terdaftar = Submitted; Siap ajukan/Ditolak = Draft; Batal dihapus.
DELETE FROM customs_documents WHERE status::text = 'cancelled';--> statement-breakpoint
UPDATE customs_documents SET status = 'submitted' WHERE status::text = 'registered';--> statement-breakpoint
UPDATE customs_documents SET status = 'draft' WHERE status::text IN ('ready', 'rejected');--> statement-breakpoint
CREATE TABLE "customs_document_transfers" (
	"document_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_document_transfers_document_id_transfer_id_pk" PRIMARY KEY("document_id","transfer_id")
);
--> statement-breakpoint
ALTER TABLE "customs_document_revisions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "origin_allocations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "customs_document_revisions" CASCADE;--> statement-breakpoint
DROP TABLE "origin_allocations" CASCADE;--> statement-breakpoint
ALTER TABLE "customs_documents" DROP CONSTRAINT "customs_documents_aju_number_unique";--> statement-breakpoint
ALTER TABLE "customs_documents" DROP CONSTRAINT "customs_documents_version_positive";--> statement-breakpoint
ALTER TABLE "customs_documents" DROP CONSTRAINT "customs_documents_registered_has_number";--> statement-breakpoint
ALTER TABLE "customs_documents" DROP CONSTRAINT "customs_documents_cancelled_has_date";--> statement-breakpoint
ALTER TABLE "stock_moves" DROP CONSTRAINT "stock_moves_customs_document_line_id_customs_document_lines_id_fk";
--> statement-breakpoint
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_customs_document_id_customs_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "customs_documents" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "customs_documents" ALTER COLUMN "status" SET DEFAULT 'draft'::text;--> statement-breakpoint
DROP TYPE "public"."customs_document_status";--> statement-breakpoint
CREATE TYPE "public"."customs_document_status" AS ENUM('draft', 'submitted');--> statement-breakpoint
ALTER TABLE "customs_documents" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."customs_document_status";--> statement-breakpoint
ALTER TABLE "customs_documents" ALTER COLUMN "status" SET DATA TYPE "public"."customs_document_status" USING "status"::"public"."customs_document_status";--> statement-breakpoint
DROP INDEX "stock_moves_customs_document_line_idx";--> statement-breakpoint
DROP INDEX "transfers_customs_document_idx";--> statement-breakpoint
DROP INDEX "customs_documents_aju_date_idx";--> statement-breakpoint
ALTER TABLE "customs_documents" ALTER COLUMN "aju_number" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customs_documents" ALTER COLUMN "aju_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_documents" ALTER COLUMN "aju_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customs_documents" ALTER COLUMN "aju_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_documents" ADD COLUMN "number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_document_transfers" ADD CONSTRAINT "customs_document_transfers_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_document_transfers" ADD CONSTRAINT "customs_document_transfers_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customs_document_transfers_transfer_idx" ON "customs_document_transfers" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "customs_documents_aju_number_idx" ON "customs_documents" USING btree ("aju_number");--> statement-breakpoint
ALTER TABLE "stock_moves" DROP COLUMN "customs_document_line_id";--> statement-breakpoint
ALTER TABLE "transfers" DROP COLUMN "customs_document_id";--> statement-breakpoint
ALTER TABLE "customs_documents" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "customs_documents" DROP COLUMN "rejection_reason";--> statement-breakpoint
ALTER TABLE "customs_documents" DROP COLUMN "cancelled_at";--> statement-breakpoint
-- Nomor urut dokumen lama per jenis, urut tanggal dibuat (sequence it.inventory.document.XX hmx).
UPDATE customs_documents d SET number = 'IT/' || d.doc_code || '/' || lpad(n.seq::text, 5, '0')
FROM (
  SELECT id, row_number() OVER (PARTITION BY doc_code ORDER BY created_at, id) AS seq
  FROM customs_documents
) n
WHERE n.id = d.id;--> statement-breakpoint
INSERT INTO number_sequences (scope, period, last_value)
SELECT 'customs_document:' || doc_code, 'all', count(*) FROM customs_documents GROUP BY doc_code
ON CONFLICT (scope, period) DO UPDATE SET last_value = EXCLUDED.last_value;--> statement-breakpoint
INSERT INTO customs_document_transfers (document_id, transfer_id)
SELECT document_id, transfer_id FROM customs_links_old;--> statement-breakpoint
ALTER TABLE "customs_documents" ADD CONSTRAINT "customs_documents_number_unique" UNIQUE("number");