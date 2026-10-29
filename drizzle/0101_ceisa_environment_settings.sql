-- Custom SQL migration file, put your code below! --
-- Pilihan pengguna: konfigurasi CEISA di database, URL produksi mengikuti Postman.
INSERT INTO system_settings (key, value, description)
VALUES ('ceisa.environment', '"production"'::jsonb, 'Lingkungan CEISA')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- Pertahankan akun yang sudah diisi saat sebelumnya aplikasi memakai host development.
-- Jangan memindahkan token antar lingkungan atau menimpa akun produksi yang sudah ada.
INSERT INTO ceisa_connections (environment, username, password_enc, api_key_enc, last_outcome, last_message)
SELECT 'production', username, password_enc, api_key_enc, 'misconfigured',
       'Akun CEISA tersimpan. Pilih Hubungkan untuk autentikasi.'
FROM ceisa_connections
WHERE environment = 'development' AND password_enc IS NOT NULL
ON CONFLICT (environment) DO UPDATE
SET username = EXCLUDED.username, password_enc = EXCLUDED.password_enc,
    api_key_enc = EXCLUDED.api_key_enc, last_outcome = EXCLUDED.last_outcome,
    last_message = EXCLUDED.last_message
WHERE ceisa_connections.password_enc IS NULL;
