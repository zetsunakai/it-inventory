-- Custom SQL migration file, put your code below! --
-- Perbaikan 0019: CHECK menganggap NULL sebagai lulus, sehingga partner NPWP tanpa NITKU
-- tidak tertolak. NITKU kini eksplisit wajib terisi untuk identitas NPWP.
ALTER TABLE partners DROP CONSTRAINT partners_nitku_by_identity;
--> statement-breakpoint
ALTER TABLE partners
  ADD CONSTRAINT partners_nitku_by_identity CHECK (
    CASE identity_type
      WHEN 'npwp16' THEN nitku IS NOT NULL AND nitku ~ '^[0-9]{22}$'
        AND left(nitku, 16) = identity_number
      WHEN 'npwp15' THEN nitku IS NOT NULL AND nitku ~ '^[0-9]{22}$'
        AND left(nitku, 16) = '0' || identity_number
      ELSE nitku IS NULL
    END
  );
