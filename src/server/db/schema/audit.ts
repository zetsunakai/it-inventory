import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

// Catatan perubahan data (PRD bagian 11). Diisi oleh trigger audit_row_change()
// di database, tidak pernah ditulis langsung oleh aplikasi.
// Append-only: update, delete, dan truncate ditolak oleh trigger.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Dari setting transaksi app.user_id. Kosong = perubahan oleh sistem (seed, Better Auth).
    // Sengaja tanpa foreign key: log tetap utuh walaupun user dihapus.
    userId: uuid(),
    tableName: text().notNull(),
    recordId: text(),
    action: text({ enum: ["INSERT", "UPDATE", "DELETE"] }).notNull(),
    oldData: jsonb(),
    newData: jsonb(),
  },
  (table) => [
    index("audit_logs_table_record_idx").on(table.tableName, table.recordId),
    index("audit_logs_occurred_at_idx").on(table.occurredAt),
  ],
)
