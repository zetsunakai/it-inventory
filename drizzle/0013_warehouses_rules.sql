-- Custom SQL migration file, put your code below! --
-- Aturan gudang, lokasi, dan akses gudang yang dipaksakan di database (PRD bagian 3, 5.1, 11).

ALTER TABLE warehouses
  ADD CONSTRAINT warehouses_text_not_blank CHECK (
    btrim(code) <> '' AND btrim(name) <> '' AND btrim(address) <> ''
  );
--> statement-breakpoint
-- Tipe lokasi menentukan boleh/tidaknya punya gudang (WAREHOUSE_REQUIRED_TYPES dan
-- VIRTUAL_ONLY_TYPES di src/lib/inventory.ts).
ALTER TABLE locations
  ADD CONSTRAINT locations_text_not_blank CHECK (btrim(code) <> '' AND btrim(name) <> ''),
  ADD CONSTRAINT locations_internal_in_warehouse CHECK (type <> 'internal' OR warehouse_id IS NOT NULL),
  ADD CONSTRAINT locations_virtual_outside_warehouse CHECK (
    type NOT IN ('vendor', 'customer', 'adjustment') OR warehouse_id IS NULL
  );
--> statement-breakpoint
-- Kode gudang tidak bisa diubah: dipakai sebagai acuan di dokumen dan laporan.
CREATE OR REPLACE FUNCTION warehouses_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Kode gudang tidak bisa diubah.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER warehouses_guard
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION warehouses_guard();
--> statement-breakpoint
-- Lokasi: kode, tipe, dan gudang tidak bisa diubah setelah dibuat (pergerakan stok
-- mengacu ke sana). Induk harus di gudang yang sama dan tidak boleh membentuk lingkaran.
CREATE OR REPLACE FUNCTION locations_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_warehouse uuid;
  ancestor uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.code IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'Kode lokasi tidak bisa diubah.';
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type THEN
      RAISE EXCEPTION 'Tipe lokasi tidak bisa diubah.';
    END IF;
    IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id THEN
      RAISE EXCEPTION 'Gudang lokasi tidak bisa diubah.';
    END IF;
  END IF;

  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Lokasi tidak bisa menjadi induk dirinya sendiri.';
  END IF;

  SELECT warehouse_id INTO parent_warehouse FROM locations WHERE id = NEW.parent_id;
  IF parent_warehouse IS DISTINCT FROM NEW.warehouse_id THEN
    RAISE EXCEPTION 'Lokasi induk harus berada di gudang yang sama.';
  END IF;

  ancestor := NEW.parent_id;
  WHILE ancestor IS NOT NULL LOOP
    IF ancestor = NEW.id THEN
      RAISE EXCEPTION 'Lokasi induk tidak boleh berada di bawah lokasi ini sendiri.';
    END IF;
    SELECT parent_id INTO ancestor FROM locations WHERE id = ancestor;
  END LOOP;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER locations_guard
  BEFORE INSERT OR UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION locations_guard();
--> statement-breakpoint
-- Jalur lengkap tiap lokasi dari akarnya, misalnya GB1/RAK-A/BIN-01.
CREATE VIEW location_paths AS
WITH RECURSIVE tree AS (
  SELECT id, code AS path, 0 AS depth FROM locations WHERE parent_id IS NULL
  UNION ALL
  SELECT child.id, tree.path || '/' || child.code, tree.depth + 1
  FROM locations child
  JOIN tree ON child.parent_id = tree.id
)
SELECT id, path, depth FROM tree;
--> statement-breakpoint
-- Satu-satunya aturan akses gudang (PRD bagian 3 dan 11), dipakai oleh query aplikasi dan
-- nanti oleh fungsi database transaksi. Daftar peran sama dengan ALL_WAREHOUSE_ROLES
-- di src/lib/permissions.ts.
CREATE OR REPLACE FUNCTION can_access_warehouse(p_user_id uuid, p_warehouse_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id AND role IN ('administrator', 'manajer', 'auditor')
  ) OR EXISTS (
    SELECT 1 FROM user_warehouses
    WHERE user_id = p_user_id AND warehouse_id = p_warehouse_id
  );
$$;
--> statement-breakpoint
CREATE TRIGGER warehouses_set_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER locations_set_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('warehouses');
--> statement-breakpoint
SELECT enable_audit('locations');
--> statement-breakpoint
SELECT enable_audit('user_warehouses', 'user_id');
