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

// Pelacakan produk (PRD bagian 5.1 dan 6.4, backlog R-02): tanpa, per lot/batch, atau per nomor
// seri (qty 1 per nomor, unik per produk).
export const PRODUCT_TRACKINGS = ["none", "lot", "serial"] as const
export type ProductTracking = (typeof PRODUCT_TRACKINGS)[number]

export const PRODUCT_TRACKING_LABELS: Record<ProductTracking, string> = {
  none: "Tanpa pelacakan",
  lot: "Per lot",
  serial: "Per nomor seri",
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

// Jenis transaksi inventory (PRD bagian 6.2). Retur adalah kebalikan transfer Selesai
// (penerimaan atau pengiriman) yang dirujuk lewat return_of_id.
export const TRANSFER_TYPES = [
  "receipt",
  "delivery",
  "internal",
  "return",
  "scrap",
  "adjustment",
] as const
export type TransferType = (typeof TRANSFER_TYPES)[number]

export const TRANSFER_TYPE_LABELS: Record<TransferType, string> = {
  receipt: "Penerimaan",
  delivery: "Pengiriman",
  internal: "Transfer internal",
  return: "Retur",
  scrap: "Scrap",
  adjustment: "Penyesuaian",
}

// Awalan nomor transfer, mis. PNR/2026/00001. Sama dengan fungsi transfer_number_prefix()
// di database (migrasi inventory_rules).
export const TRANSFER_NUMBER_PREFIXES: Record<TransferType, string> = {
  receipt: "PNR",
  delivery: "PGR",
  internal: "TRF",
  return: "RTR",
  scrap: "SCR",
  adjustment: "ADJ",
}

// Alur status transfer (PRD bagian 6.3): Draft → Siap → Selesai, atau Batal dari Draft/Siap.
export const TRANSFER_STATUSES = ["draft", "ready", "done", "cancelled"] as const
export type TransferStatus = (typeof TRANSFER_STATUSES)[number]

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  draft: "Draft",
  ready: "Siap",
  done: "Selesai",
  cancelled: "Batal",
}

// Status baris pergerakan: mengikuti transfernya, tanpa tahap Siap.
export const STOCK_MOVE_STATUSES = ["draft", "done", "cancelled"] as const
export type StockMoveStatus = (typeof STOCK_MOVE_STATUSES)[number]

// Sesi stock opname (PRD bagian 6.5): dihitung → menunggu persetujuan → disetujui, atau batal.
export const STOCK_COUNT_STATUSES = ["counting", "review", "approved", "cancelled"] as const
export type StockCountStatus = (typeof STOCK_COUNT_STATUSES)[number]

export const STOCK_COUNT_STATUS_LABELS: Record<StockCountStatus, string> = {
  counting: "Dihitung",
  review: "Menunggu persetujuan",
  approved: "Disetujui",
  cancelled: "Batal",
}
