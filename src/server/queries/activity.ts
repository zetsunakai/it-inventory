import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/server/db"

// Log aktivitas satu record dari audit_logs (backlog RU-23, seperti log aktivitas form hmx):
// dibuat, perubahan per field (dengan label), dihapus. Kolom teknis tidak ditampilkan.

export type ActivityChange = { field: string; from: string | null; to: string | null }

export type ActivityEntry = {
  id: number
  at: Date
  userName: string | null
  action: "INSERT" | "UPDATE" | "DELETE"
  changes: ActivityChange[]
}

// Kolom yang tidak berarti bagi user (diisi sistem atau turunan).
const HIDDEN = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "done_by",
  "approved_by",
  "number",
  "type",
  "movement_code",
  "direction",
  "classification",
  "cancelled_at",
])

export type ActivityLabels = {
  // Label kolom, mis. { status: "Status", scheduled_date: "Tanggal rencana" }.
  fields: Record<string, string>
  // Label nilai per kolom, mis. { status: { draft: "Draft" } }.
  values?: Record<string, Record<string, string>>
}

function show(value: unknown, field: string, labels: ActivityLabels): string | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "boolean") return value ? "Ya" : "Tidak"
  const text = String(value)
  const mapped = labels.values?.[field]?.[text]
  if (mapped) return mapped
  // Tanggal-waktu ISO dari jsonb → tanggal WIB.
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(text))
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.split("-").reverse().join("/")
  return text
}

export async function recordActivity(
  table: string,
  recordId: string,
  labels: ActivityLabels,
  limit = 50,
): Promise<ActivityEntry[]> {
  const result = await db.execute<{
    id: number
    occurred_at: string
    user_name: string | null
    action: "INSERT" | "UPDATE" | "DELETE"
    old_data: Record<string, unknown> | null
    new_data: Record<string, unknown> | null
  }>(sql`
    select a.id, a.occurred_at, u.name as user_name, a.action, a.old_data, a.new_data
    from audit_logs a left join users u on u.id = a.user_id
    where a.table_name = ${table} and a.record_id = ${recordId}
    order by a.id desc
    limit ${limit}`)
  return result.rows.flatMap((row) => {
    const changes: ActivityChange[] = []
    if (row.action === "UPDATE" && row.old_data && row.new_data) {
      for (const [field, label] of Object.entries(labels.fields)) {
        if (HIDDEN.has(field)) continue
        const before = row.old_data[field]
        const after = row.new_data[field]
        if (JSON.stringify(before) === JSON.stringify(after)) continue
        // Rujukan ke data lain (…_id): cukup disebut berubah.
        const reference = field.endsWith("_id")
        changes.push({
          field: label,
          from: reference ? null : show(before, field, labels),
          to: reference ? "diubah" : show(after, field, labels),
        })
      }
      // Perubahan yang hanya menyentuh kolom teknis tidak ditampilkan.
      if (changes.length === 0) return []
    }
    return [
      {
        id: row.id,
        at: new Date(row.occurred_at),
        userName: row.user_name,
        action: row.action,
        changes,
      },
    ]
  })
}

// Baris anak satu record (mis. peran pengguna, akses gudang) yang ditambah atau dihapus, ditampilkan
// sebagai perubahan record induknya. describe mengubah isi baris menjadi teks, mis. nama peran.
export async function childActivity(
  table: string,
  parentId: string,
  field: string,
  describe: (data: Record<string, unknown>) => string,
  limit = 50,
): Promise<ActivityEntry[]> {
  const result = await db.execute<{
    id: number
    occurred_at: string
    user_name: string | null
    action: "INSERT" | "UPDATE" | "DELETE"
    old_data: Record<string, unknown> | null
    new_data: Record<string, unknown> | null
  }>(sql`
    select a.id, a.occurred_at, u.name as user_name, a.action, a.old_data, a.new_data
    from audit_logs a left join users u on u.id = a.user_id
    where a.table_name = ${table} and a.record_id = ${parentId} and a.action <> 'UPDATE'
    order by a.id desc
    limit ${limit}`)
  return result.rows.map((row) => {
    const added = row.action === "INSERT"
    const text = describe((added ? row.new_data : row.old_data) ?? {})
    return {
      id: row.id,
      at: new Date(row.occurred_at),
      userName: row.user_name,
      action: "UPDATE" as const,
      changes: [{ field, from: added ? null : text, to: added ? `+ ${text}` : "dihapus" }],
    }
  })
}

// Gabungan beberapa sumber riwayat, terbaru dulu.
export function mergeActivity(...lists: ActivityEntry[][]) {
  return lists.flat().sort((a, b) => b.id - a.id)
}

// Riwayat semua record satu tabel kecil (mis. pengaturan): setiap perubahan kolom `column` tampil
// sebagai "<label record>: lama → baru".
export async function tableActivity(
  table: string,
  column: string,
  recordLabel: (recordId: string) => string,
  limit = 50,
): Promise<ActivityEntry[]> {
  const result = await db.execute<{
    id: number
    occurred_at: string
    user_name: string | null
    record_id: string
    action: "INSERT" | "UPDATE" | "DELETE"
    old_data: Record<string, unknown> | null
    new_data: Record<string, unknown> | null
  }>(sql`
    select a.id, a.occurred_at, u.name as user_name, a.record_id, a.action, a.old_data, a.new_data
    from audit_logs a left join users u on u.id = a.user_id
    where a.table_name = ${table}
    order by a.id desc
    limit ${limit}`)
  const text = (value: unknown) =>
    value === null || value === undefined
      ? null
      : typeof value === "string"
        ? value
        : JSON.stringify(value)
  return result.rows.flatMap((row) => {
    const before = text(row.old_data?.[column])
    const after = text(row.new_data?.[column])
    if (row.action === "UPDATE" && before === after) return []
    return [
      {
        id: row.id,
        at: new Date(row.occurred_at),
        userName: row.user_name,
        action: "UPDATE" as const,
        changes: [
          {
            field: recordLabel(row.record_id),
            from: before,
            to: row.action === "DELETE" ? "dihapus" : after,
          },
        ],
      },
    ]
  })
}
