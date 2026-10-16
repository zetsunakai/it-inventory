import "server-only"

import { asc, eq, isNull, or, sql } from "drizzle-orm"
import { z } from "zod"

import { requiredText } from "@/lib/form-fields"
import {
  flagText,
  matchOption,
  optionList,
  parseFlag,
  type ImportColumn,
  type ImportResult,
} from "@/lib/import"
import {
  LOCATION_TYPE_LABELS,
  WAREHOUSE_LOCATION_TYPES,
  type LocationType,
} from "@/modules/inventory/lib/inventory"
import type { Transaction } from "@/server/db/audit"
import { db } from "@/server/db"
import { locationPaths, locations, warehouses } from "@/server/db/schema"
import { writeSpreadsheet, type SpreadsheetFormat } from "@/server/spreadsheet"

import {
  DuplicateKeys,
  exportColumns,
  issueMessages,
  RowErrors,
  type ImportRow,
} from "@/server/master-io/common"

// Import/export lokasi (backlog M1-07). Aturannya sama dengan form lokasi dan trigger
// locations_guard (migrasi 0013): lokasi baru selalu di dalam gudang; kode, tipe, dan gudang
// tidak bisa diubah; induk harus di gudang yang sama dan tidak membentuk lingkaran.
// Lokasi induk boleh baris lain di file yang sama.

const NEW_LOCATION_TYPE_LABELS = Object.fromEntries(
  WAREHOUSE_LOCATION_TYPES.map((type) => [type, LOCATION_TYPE_LABELS[type]]),
)

export const LOCATION_COLUMNS = [
  {
    key: "code",
    header: "Kode",
    width: 16,
    required: "always",
    description: "Kode unik lokasi. Kode yang sudah ada berarti lokasi itu diperbarui.",
  },
  { key: "name", header: "Nama", width: 32, required: "new", description: "Nama lokasi." },
  {
    key: "type",
    header: "Tipe",
    width: 14,
    required: "new",
    description: `${optionList(NEW_LOCATION_TYPE_LABELS)}. Tidak bisa diubah setelah lokasi dibuat.`,
  },
  {
    key: "warehouse",
    header: "Gudang",
    width: 12,
    required: "new",
    description:
      "Kode gudang. Tidak bisa diubah. Kosong hanya untuk lokasi virtual yang dibuat sistem.",
  },
  {
    key: "parent",
    header: "Induk",
    width: 16,
    description:
      "Kode lokasi induk di gudang yang sama, boleh lokasi lain di file ini. Kosong berarti lokasi paling atas.",
  },
  {
    key: "active",
    header: "Aktif",
    width: 8,
    description: "Ya, atau Tidak untuk mengarsipkan. Kosong berarti Ya.",
  },
] as const satisfies readonly ImportColumn[]

type LocationKey = (typeof LOCATION_COLUMNS)[number]["key"]

type SavedLocation = {
  id: string
  code: string
  name: string
  type: LocationType
  warehouseId: string | null
  parentId: string | null
  active: boolean
}

// Lokasi virtual (tanpa gudang) dan lokasi di gudang yang boleh dilihat user, urut pohonnya.
export async function exportLocations(format: SpreadsheetFormat, userId: string) {
  const rows = await db
    .select({
      id: locations.id,
      code: locations.code,
      name: locations.name,
      type: locations.type,
      warehouse: warehouses.code,
      parentId: locations.parentId,
      active: locations.active,
    })
    .from(locations)
    .innerJoin(locationPaths, eq(locationPaths.id, locations.id))
    .leftJoin(warehouses, eq(warehouses.id, locations.warehouseId))
    .where(
      or(
        isNull(locations.warehouseId),
        sql`can_access_warehouse(${userId}, ${locations.warehouseId})`,
      ),
    )
    .orderBy(asc(warehouses.code), asc(locationPaths.path))
  // Induk selalu di gudang yang sama, jadi selalu ada di hasil yang sama.
  const codeById = new Map(rows.map((row) => [row.id, row.code]))
  const values = rows.map((row) => {
    const sheet: Record<LocationKey, string> = {
      code: row.code,
      name: row.name,
      type: LOCATION_TYPE_LABELS[row.type],
      warehouse: row.warehouse ?? "",
      parent: row.parentId ? (codeById.get(row.parentId) ?? "") : "",
      active: flagText(row.active),
    }
    return LOCATION_COLUMNS.map((column) => sheet[column.key])
  })
  return writeSpreadsheet(format, "Lokasi", exportColumns(LOCATION_COLUMNS), values)
}

const rowSchema = z.object({
  code: requiredText("Kode lokasi", 30),
  name: requiredText("Nama lokasi", 200),
})

type CheckedRow = {
  line: number
  code: string
  messages: string[]
  saved?: SavedLocation
  name: string
  type?: LocationType
  warehouseId: string | null
  parentCode: string
  active: boolean
}

export async function importLocationRows(
  tx: Transaction,
  rows: ImportRow<LocationKey>[],
): Promise<ImportResult> {
  // Semua lokasi dimuat sekaligus: induk dan lingkaran harus dicek terhadap seluruh pohon.
  // Berurutan: query di satu transaksi memakai satu koneksi, jadi tidak bisa paralel.
  const savedRows = await tx
    .select({
      id: locations.id,
      code: locations.code,
      name: locations.name,
      type: locations.type,
      warehouseId: locations.warehouseId,
      parentId: locations.parentId,
      active: locations.active,
    })
    .from(locations)
  const warehouseRows = await tx
    .select({ id: warehouses.id, code: warehouses.code, active: warehouses.active })
    .from(warehouses)
  const savedByCode = new Map(savedRows.map((row) => [row.code, row]))
  const codeById = new Map(savedRows.map((row) => [row.id, row.code]))
  const warehouseByCode = new Map(warehouseRows.map((row) => [row.code, row.id]))
  const warehouseCode = new Map(warehouseRows.map((row) => [row.id, row.code]))
  const archivedWarehouses = new Set(
    warehouseRows.filter((row) => !row.active).map((row) => row.id),
  )

  // Tahap 1: periksa setiap baris sendiri-sendiri.
  const duplicates = new DuplicateKeys()
  const checked: CheckedRow[] = rows.map((row) => {
    const code = row.values.code ?? ""
    const saved = savedByCode.get(code)
    const sheet = {
      ...(saved && {
        name: saved.name,
        type: LOCATION_TYPE_LABELS[saved.type],
        warehouse: saved.warehouseId ? warehouseCode.get(saved.warehouseId) : "",
        parent: saved.parentId ? codeById.get(saved.parentId) : "",
      }),
      ...row.values,
    }
    const messages: string[] = []

    const duplicate = duplicates.check(code, row.line, "Kode lokasi")
    if (duplicate) messages.push(duplicate)
    const parsed = rowSchema.safeParse({ code, name: sheet.name })
    if (!parsed.success) messages.push(...issueMessages(parsed.error))
    const active = parseFlag(sheet.active ?? "", true)
    if (active === undefined) messages.push("Aktif harus Ya atau Tidak.")

    const type = sheet.type ? matchOption(sheet.type, LOCATION_TYPE_LABELS) : undefined
    if (sheet.type && !type) {
      messages.push(
        `Tipe lokasi "${sheet.type}" tidak dikenal. Pilih ${optionList(NEW_LOCATION_TYPE_LABELS)}.`,
      )
    }
    const warehouseId = sheet.warehouse ? (warehouseByCode.get(sheet.warehouse) ?? null) : null
    if (sheet.warehouse && !warehouseId) messages.push(`Gudang ${sheet.warehouse} tidak ditemukan.`)

    if (saved) {
      if (type && type !== saved.type) {
        messages.push(
          `Tipe lokasi tidak bisa diubah (tersimpan: ${LOCATION_TYPE_LABELS[saved.type]}).`,
        )
      }
      if (warehouseId !== saved.warehouseId && (warehouseId || !sheet.warehouse)) {
        const savedWarehouse = saved.warehouseId
          ? warehouseCode.get(saved.warehouseId)
          : "tanpa gudang"
        messages.push(`Gudang lokasi tidak bisa diubah (tersimpan: ${savedWarehouse}).`)
      }
    } else {
      if (!sheet.type) messages.push("Tipe lokasi wajib diisi.")
      else if (type && !WAREHOUSE_LOCATION_TYPES.includes(type)) {
        messages.push(
          `Lokasi bertipe ${LOCATION_TYPE_LABELS[type]} hanya dibuat oleh sistem. Pilih ${optionList(NEW_LOCATION_TYPE_LABELS)}.`,
        )
      }
      if (!sheet.warehouse) messages.push("Gudang wajib diisi untuk lokasi baru.")
      else if (warehouseId && archivedWarehouses.has(warehouseId)) {
        messages.push(`Gudang ${sheet.warehouse} diarsipkan. Aktifkan dulu untuk menambah lokasi.`)
      }
    }

    return {
      line: row.line,
      code,
      messages,
      saved,
      name: sheet.name ?? "",
      type: type ?? saved?.type,
      warehouseId,
      parentCode: sheet.parent ?? "",
      active: active !== false,
    }
  })

  // Tahap 2: induk dicek terhadap pohon akhir (lokasi tersimpan yang ditimpa isi file).
  type Node = { warehouseId: string | null; parentCode: string; active: boolean }
  const tree = new Map<string, Node>()
  for (const row of savedRows) {
    tree.set(row.code, {
      warehouseId: row.warehouseId,
      parentCode: row.parentId ? codeById.get(row.parentId)! : "",
      active: row.active,
    })
  }
  for (const row of checked) {
    if (row.code) {
      tree.set(row.code, {
        warehouseId: row.warehouseId,
        parentCode: row.parentCode,
        active: row.active,
      })
    }
  }
  const savedParentCode = (row: CheckedRow) =>
    row.saved?.parentId ? codeById.get(row.saved.parentId) : undefined
  for (const row of checked) {
    if (!row.parentCode) continue
    const parentNode = tree.get(row.parentCode)
    if (row.parentCode === row.code) {
      row.messages.push("Lokasi tidak bisa menjadi induk dirinya sendiri.")
    } else if (!parentNode) {
      row.messages.push(`Lokasi induk ${row.parentCode} tidak ditemukan.`)
    } else if (parentNode.warehouseId !== row.warehouseId) {
      row.messages.push(`Lokasi induk ${row.parentCode} harus berada di gudang yang sama.`)
    } else if (!parentNode.active && row.parentCode !== savedParentCode(row)) {
      // Induk yang diarsipkan hanya boleh bila memang induk yang tersimpan sebelumnya.
      row.messages.push(`Lokasi induk ${row.parentCode} diarsipkan.`)
    } else if (ancestors(tree, row.parentCode).includes(row.code)) {
      row.messages.push(`Lokasi induk ${row.parentCode} berada di bawah lokasi ini sendiri.`)
    }
  }

  const errors = new RowErrors()
  for (const row of checked) errors.add(row.line, row.code, row.messages)
  if (errors.count) return errors.result(rows.length)

  // Simpan dari lokasi paling atas ke bawah: saat sebuah lokasi disimpan, induk dan semua
  // leluhurnya sudah dalam keadaan akhir, sehingga trigger locations_guard tidak pernah melihat
  // lingkaran sementara. Id lokasi baru dibuat di sini supaya anaknya bisa langsung menunjuk.
  const idByCode = new Map(savedRows.map((row) => [row.code, row.id]))
  for (const row of checked) if (!row.saved) idByCode.set(row.code, crypto.randomUUID())
  const ordered = checked
    .map((row) => ({ row, depth: ancestors(tree, row.code).length }))
    .sort((a, b) => a.depth - b.depth)

  let created = 0
  let updated = 0
  for (const { row } of ordered) {
    const parentId = row.parentCode ? idByCode.get(row.parentCode)! : null
    if (!row.saved) {
      await tx.insert(locations).values({
        id: idByCode.get(row.code),
        code: row.code,
        name: row.name,
        type: row.type!,
        warehouseId: row.warehouseId,
        parentId,
        active: row.active,
      })
      created++
    } else if (
      row.saved.name !== row.name ||
      row.saved.parentId !== parentId ||
      row.saved.active !== row.active
    ) {
      await tx
        .update(locations)
        .set({ name: row.name, parentId, active: row.active })
        .where(eq(locations.id, row.saved.id))
      updated++
    }
  }
  return {
    status: "imported",
    total: rows.length,
    created,
    updated,
    unchanged: rows.length - created - updated,
  }
}

// Kode leluhur sebuah lokasi, dari induk langsung ke atas. Berhenti bila bertemu lingkaran.
function ancestors(tree: Map<string, { parentCode: string }>, code: string) {
  const result: string[] = []
  let current = tree.get(code)?.parentCode
  while (current && !result.includes(current)) {
    result.push(current)
    current = tree.get(current)?.parentCode
  }
  return result
}
