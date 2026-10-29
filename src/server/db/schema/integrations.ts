import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { timestamps } from "./_columns"

// Koneksi CEISA per lingkungan (Pengaturan › Integrasi CEISA).
// Password dan token terenkripsi (AES-256-GCM), dikecualikan dari audit log.
export const ceisaConnections = pgTable("ceisa_connections", {
  // "development" | "production"; pilihan aktif di system_settings (ceisa.environment).
  environment: text().primaryKey(),
  username: text(),
  passwordEnc: text("password_enc"),
  apiKeyEnc: text("api_key_enc"),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  // Waktu autentikasi terakhir yang berhasil.
  authenticatedAt: timestamp({ withTimezone: true }),
  // Percobaan terakhir, berhasil maupun gagal.
  lastAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  // connected | authentication_failed | forbidden | misconfigured | timeout |
  // unreachable | invalid_response | server_error (lihat lib/ceisa.ts).
  lastOutcome: text("last_outcome").notNull(),
  lastMessage: text("last_message"),
  lastHttpStatus: integer("last_http_status"),
  ...timestamps,
})
