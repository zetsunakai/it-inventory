-- Konvensi repo: setiap tabel dengan updated_at memakai trigger set_updated_at().
CREATE TRIGGER ceisa_connections_set_updated_at
BEFORE UPDATE ON ceisa_connections
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Riwayat percobaan Connect tercatat di audit log, termasuk pelakunya.
-- Token terenkripsi disamarkan supaya tidak pernah masuk log.
SELECT enable_audit('ceisa_connections', 'environment', '{access_token_enc,refresh_token_enc}');
