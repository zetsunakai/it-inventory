import "server-only"

import { and, eq } from "drizzle-orm"

import type {
  WarehouseLocationChanges,
  WarehouseLocationDraft,
} from "@/modules/inventory/lib/warehouse-locations"
import { AppError } from "@/server/actions/app-error"
import type { Transaction } from "@/server/db/audit"
import { deleteUnlessUsed } from "@/server/db/delete-record"
import { locations, warehouses } from "@/server/db/schema"

// Dipanggil dalam transaksi penyimpanan gudang: seluruh perubahan lokasi ikut rollback bila gagal.
export async function saveWarehouseLocations(
  tx: Transaction,
  warehouseId: string,
  changes: WarehouseLocationChanges,
  selectedStockLocation?: string | null,
) {
  const [warehouse] = await tx
    .select()
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId))
    .for("update")
  if (!warehouse) throw new AppError("Gudang tidak ditemukan.")
  const saved = await tx
    .select()
    .from(locations)
    .where(eq(locations.warehouseId, warehouseId))
    .for("update")
  const previous = new Map(saved.map((row) => [row.id, row]))
  const deleted = new Set(changes.deletedIds)
  const final = new Map<string, Omit<WarehouseLocationDraft, "isNew">>(
    saved.filter((row) => !deleted.has(row.id)).map((row) => [row.id, row]),
  )
  for (const id of deleted) {
    if (!previous.has(id))
      throw new AppError("Lokasi yang dihapus bukan milik gudang ini atau sudah tidak ada.")
  }
  for (const row of changes.rows) {
    const before = previous.get(row.id)
    if (row.isNew) {
      if (before) throw new AppError(`Lokasi ${row.code} sudah tersimpan. Muat ulang halaman.`)
      if (!warehouse.active) throw new AppError("Aktifkan gudang sebelum menambahkan lokasi.")
    } else {
      if (!before)
        throw new AppError(`Lokasi ${row.code} bukan milik gudang ini atau sudah dihapus.`)
      if (row.code !== before.code || row.type !== before.type)
        throw new AppError(`Kode dan tipe lokasi ${before.code} tidak bisa diubah.`)
    }
    final.set(row.id, row)
  }
  for (const row of final.values()) {
    if (row.parentId) {
      const parent = final.get(row.parentId)
      if (!parent)
        throw new AppError(`Lokasi induk ${row.code} tidak ada di gudang ini atau akan dihapus.`)
      if (!parent.active && previous.get(row.id)?.parentId !== row.parentId)
        throw new AppError(`Lokasi induk ${row.code} sudah diarsipkan.`)
    }
  }
  // Urutan induk sebelum anak, sekaligus menolak siklus termasuk antara baris yang belum disimpan.
  const ordered: string[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) throw new AppError("Lokasi induk tidak boleh membentuk lingkaran.")
    if (visited.has(id)) return
    visiting.add(id)
    const row = final.get(id)!
    if (row.parentId) visit(row.parentId)
    visiting.delete(id)
    visited.add(id)
    ordered.push(id)
  }
  for (const id of final.keys()) visit(id)
  const drafts = new Map(changes.rows.map((row) => [row.id, row]))
  // Pilihan stok utama dapat dipindahkan bersamaan dengan pengarsipan lokasi lama.
  if (selectedStockLocation !== undefined && selectedStockLocation !== warehouse.stockLocationId) {
    await tx.update(warehouses).set({ stockLocationId: null }).where(eq(warehouses.id, warehouseId))
  }
  // Lepas induk yang berubah dahulu agar perpindahan hierarki tidak membentuk siklus sementara.
  for (const row of changes.rows) {
    const before = previous.get(row.id)
    if (before && before.parentId !== row.parentId)
      await tx
        .update(locations)
        .set({ parentId: null })
        .where(and(eq(locations.id, row.id), eq(locations.warehouseId, warehouseId)))
  }
  for (const id of ordered) {
    const row = drafts.get(id)
    if (!row) continue
    const { isNew, ...values } = row
    if (isNew) await tx.insert(locations).values({ ...values, warehouseId })
    else {
      const before = previous.get(id)!
      if (
        before.name !== row.name ||
        before.parentId !== row.parentId ||
        before.active !== row.active
      ) {
        await tx
          .update(locations)
          .set({ name: row.name, parentId: row.parentId, active: row.active })
          .where(and(eq(locations.id, id), eq(locations.warehouseId, warehouseId)))
      }
    }
  }
  let stockId =
    selectedStockLocation === undefined ? warehouse.stockLocationId : selectedStockLocation
  if (!stockId)
    stockId =
      changes.rows.find(
        (row) => row.isNew && row.active && row.type === "internal" && !row.parentId,
      )?.id ?? null
  if (stockId) {
    const stock = final.get(stockId)
    if (!stock || !stock.active || stock.type !== "internal")
      throw new AppError(
        "Lokasi stok utama harus lokasi internal aktif yang tidak dihapus di gudang ini.",
      )
  }
  await tx
    .update(warehouses)
    .set({ stockLocationId: stockId })
    .where(eq(warehouses.id, warehouseId))
  // Hapus anak lebih dahulu. FK tetap menolak lokasi yang sudah dipakai transaksi.
  const depth = (id: string): number => {
    const parent = previous.get(id)?.parentId
    return parent && deleted.has(parent) ? 1 + depth(parent) : 0
  }
  for (const id of [...deleted].sort((a, b) => depth(b) - depth(a))) {
    await deleteUnlessUsed(tx, locations, locations.id, id, "Lokasi")
  }
}
