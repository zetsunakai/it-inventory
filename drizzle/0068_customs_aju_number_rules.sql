-- Custom SQL migration file, put your code below! --
-- Nomor aju (backlog M3-02, PRD bagian 7.4), format Equip3 26 karakter:
--   kode perusahaan (3) + kode dokumen (3) + kode kantor (6) + YYYYMMDD (8) + nomor urut (6).
-- Kode perusahaan dari pengaturan customs.aju_company_code; kode kantor dari kantor pabean
-- dokumen, atau kantor pengawas di profil perusahaan bila kosong. Tanggal WIB. Nomor urut per
-- jenis dokumen lewat next_number(), jadi aman saat dokumen dibuat bersamaan. Nomor aju dibuat
-- saat dokumen dibuat dan tidak pernah berubah, termasuk saat revisi.

INSERT INTO system_settings (key, value, description)
VALUES (
  'customs.aju_company_code',
  '"000"',
  'Kode perusahaan 3 karakter (huruf besar atau angka) di awal nomor aju dokumen BC'
)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_aju_number(
  p_doc_code customs_doc_code,
  p_office_code text DEFAULT NULL,
  p_date date DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  company_code text := (SELECT value #>> '{}' FROM system_settings WHERE key = 'customs.aju_company_code');
  office_code text := coalesce(p_office_code, (SELECT supervising_office_code FROM company));
  aju_date date := coalesce(p_date, (now() AT TIME ZONE 'Asia/Jakarta')::date);
  running integer;
BEGIN
  IF company_code IS NULL OR company_code !~ '^[0-9A-Z]{3}$' THEN
    RAISE EXCEPTION 'Kode perusahaan untuk nomor aju harus 3 huruf besar atau angka (Pengaturan customs.aju_company_code).';
  END IF;
  IF office_code IS NULL THEN
    RAISE EXCEPTION 'Kantor pabean dokumen belum dipilih dan profil perusahaan belum diisi.';
  END IF;
  IF office_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Kode kantor pabean % harus 6 digit untuk nomor aju.', office_code;
  END IF;
  running := next_number('aju:' || p_doc_code::text, '');
  IF running > 999999 THEN
    RAISE EXCEPTION 'Nomor urut aju BC % sudah melewati 999999.', p_doc_code;
  END IF;
  RETURN company_code || lpad(p_doc_code::text, 3, '0') || office_code
    || to_char(aju_date, 'YYYYMMDD') || lpad(running::text, 6, '0');
END;
$$;
--> statement-breakpoint
ALTER TABLE customs_documents
  ADD CONSTRAINT customs_documents_aju_number_format CHECK (aju_number ~ '^[0-9A-Z]{26}$');
--> statement-breakpoint
-- Menggantikan versi M3-01: ditambah pengisian dan penguncian nomor aju.
CREATE OR REPLACE FUNCTION customs_documents_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := nullif(current_setting('app.user_id', true), '')::uuid;
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Dokumen BC baru selalu berstatus Draft.';
    END IF;
    NEW.aju_date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
    NEW.aju_number := next_aju_number(NEW.doc_code, NEW.customs_office_code, NEW.aju_date);
  ELSE
    IF NEW.doc_code <> OLD.doc_code THEN
      RAISE EXCEPTION 'Jenis dokumen BC tidak bisa diubah.';
    END IF;
    IF NEW.aju_number <> OLD.aju_number OR NEW.aju_date <> OLD.aju_date THEN
      RAISE EXCEPTION 'Nomor dan tanggal aju tidak bisa diubah.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
