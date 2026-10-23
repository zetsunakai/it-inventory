import type { WarehouseLocationDraft } from "@/modules/inventory/lib/warehouse-locations"

export const WAREHOUSE_LOCATION_FIELDS = [
  { id: "code", label: "Kode", required: true },
  { id: "name", label: "Nama", required: true },
  { id: "type", label: "Tipe" },
  { id: "parent", label: "Lokasi induk" },
  { id: "path", label: "Jalur", optional: true },
  { id: "active", label: "Aktif" },
] as const

export function warehouseLocationPath(
  row: WarehouseLocationDraft,
  rows: WarehouseLocationDraft[],
  seen = new Set<string>(),
): string {
  if (seen.has(row.id)) return row.code
  seen.add(row.id)
  const parent = rows.find((entry) => entry.id === row.parentId)
  return parent ? `${warehouseLocationPath(parent, rows, seen)}/${row.code}` : row.code
}
