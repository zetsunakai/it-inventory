// Kategori IT Inventory dan tipe lokasi (PRD bagian 5.1 dan 9.2). Dipakai bersama
// oleh server dan UI.

// Kategori laporan mutasi. Dipakai gudang (M1-03) dan produk (M1-05).
export const INVENTORY_CATEGORIES = [
  "raw_material",
  "wip",
  "finished_good",
  "machine",
  "scrap",
] as const
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number]

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  raw_material: "Bahan baku",
  wip: "WIP",
  finished_good: "Barang jadi",
  machine: "Mesin & peralatan",
  scrap: "Scrap & reject",
}

export const LOCATION_TYPES = [
  "internal",
  "transit",
  "vendor",
  "customer",
  "scrap",
  "adjustment",
] as const
export type LocationType = (typeof LOCATION_TYPES)[number]

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  internal: "Internal",
  transit: "Transit",
  vendor: "Vendor",
  customer: "Customer",
  scrap: "Scrap",
  adjustment: "Penyesuaian",
}

// Aturan gudang per tipe lokasi (dipaksakan juga di database, migrasi locations_rules):
// internal selalu di dalam gudang; vendor, customer, dan penyesuaian adalah lokasi virtual
// di luar gudang; transit dan scrap boleh keduanya.
export const WAREHOUSE_REQUIRED_TYPES: readonly LocationType[] = ["internal"]
export const VIRTUAL_ONLY_TYPES: readonly LocationType[] = ["vendor", "customer", "adjustment"]

// Tipe yang bisa dibuat di dalam sebuah gudang.
export const WAREHOUSE_LOCATION_TYPES = LOCATION_TYPES.filter(
  (type) => !VIRTUAL_ONLY_TYPES.includes(type),
)
