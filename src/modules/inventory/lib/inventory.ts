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

// Kode pergerakan (PRD bagian 6.2, backlog R-04), mengikuti hmx-002. Diisi database dari jenis
// transfer dan lokasinya (fungsi transfer_movement_code); kartu stok dan laporan membacanya.
export const MOVEMENT_CODES = [
  "gr",
  "gi",
  "ilt",
  "itw_out",
  "itw_in",
  "itw_rtn",
  "gr_rtn",
  "gi_rtn",
  "pu",
  "adj_in",
  "adj_out",
] as const
export type MovementCode = (typeof MOVEMENT_CODES)[number]

export const MOVEMENT_CODE_LABELS: Record<MovementCode, string> = {
  gr: "Penerimaan",
  gi: "Pengiriman",
  ilt: "Pindah lokasi",
  itw_out: "Transfer antar gudang keluar",
  itw_in: "Transfer antar gudang masuk",
  itw_rtn: "Kembali dari transit",
  // Mengikuti hmx (I-02): gr_rtn = barang masuk karena retur (retur dari customer, pengganti dari
  // vendor), gi_rtn = barang keluar karena retur (retur ke vendor, pengganti ke customer).
  gr_rtn: "Retur masuk",
  gi_rtn: "Retur keluar",
  pu: "Pemakaian & scrap",
  adj_in: "Penyesuaian tambah",
  adj_out: "Penyesuaian kurang",
}

// Arah pergerakan dilihat dari gudang: masuk, keluar, atau di dalam gudang.
export const MOVEMENT_DIRECTIONS = ["in", "out", "internal"] as const
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number]

// Sama dengan fungsi database movement_direction() (migrasi movement_codes).
export const MOVEMENT_CODE_DIRECTIONS: Record<MovementCode, MovementDirection> = {
  gr: "in",
  gr_rtn: "in",
  itw_in: "in",
  itw_rtn: "in",
  adj_in: "in",
  ilt: "internal",
  gi: "out",
  gi_rtn: "out",
  itw_out: "out",
  pu: "out",
  adj_out: "out",
}

// Alur status transfer (PRD bagian 6.3, backlog R-06, mengikuti hmx-002): Draft → Konfirmasi →
// Menunggu / Sebagian tersedia / Siap → Selesai; Batal dari status mana pun sebelum Selesai.
// Transfer masuk langsung Siap; transfer yang mengambil stok gudang menunggu stoknya tersedia.
// Status hanya berubah lewat fungsi database (confirm_transfer, check_transfer_availability,
// reset_transfer_to_draft, cancel_transfer, validate_transfer).
export const TRANSFER_STATUSES = [
  "draft",
  "waiting",
  "partially_available",
  "ready",
  "rejected",
  "done",
  "cancelled",
] as const
export type TransferStatus = (typeof TRANSFER_STATUSES)[number]

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  draft: "Draft",
  waiting: "Menunggu",
  partially_available: "Sebagian tersedia",
  ready: "Siap",
  rejected: "Ditolak",
  done: "Selesai",
  cancelled: "Batal",
}

// Status yang masih bisa dikerjakan (belum Selesai/Batal) dan yang sudah dikonfirmasi.
export const OPEN_TRANSFER_STATUSES: readonly TransferStatus[] = [
  "draft",
  "waiting",
  "partially_available",
  "ready",
  "rejected",
]
export const CONFIRMED_TRANSFER_STATUSES: readonly TransferStatus[] = [
  "waiting",
  "partially_available",
  "ready",
]

// Permintaan transfer antar gudang (backlog R-10, iwt_request hmx-002): barang keluar dari gudang
// asal ke lokasi transit, lalu masuk ke gudang tujuan. Sisa di transit dikembalikan ke gudang asal
// atau dicatat sebagai susut transit.
export const INTERWAREHOUSE_STATUSES = [
  "draft",
  "confirmed",
  "in_progress",
  "done",
  "cancelled",
] as const
export type InterwarehouseStatus = (typeof INTERWAREHOUSE_STATUSES)[number]

export const INTERWAREHOUSE_STATUS_LABELS: Record<InterwarehouseStatus, string> = {
  draft: "Draft",
  confirmed: "Dikonfirmasi",
  in_progress: "Di perjalanan",
  done: "Selesai",
  cancelled: "Batal",
}

export const INTERWAREHOUSE_STATUS_TONES: Record<
  InterwarehouseStatus,
  "neutral" | "info" | "success" | "warning"
> = {
  draft: "neutral",
  confirmed: "info",
  in_progress: "warning",
  done: "success",
  cancelled: "neutral",
}

// Jenis pemakaian transfer kode pu (backlog R-12, usage_type hmx-002). Susut transit hanya dari
// lokasi transit lewat permintaan transfer antar gudang, jadi tidak bisa dipilih di form.
export const USAGE_TYPES = ["usage", "scrap", "transit_loss", "other"] as const
export type UsageType = (typeof USAGE_TYPES)[number]

export const USAGE_TYPE_LABELS: Record<UsageType, string> = {
  usage: "Pemakaian",
  scrap: "Scrap",
  transit_loss: "Susut transit",
  other: "Lainnya",
}

export const MANUAL_USAGE_TYPES = [
  "usage",
  "scrap",
  "other",
] as const satisfies readonly UsageType[]

// Permintaan retur (backlog R-11, return_request hmx-002): retur ke vendor (dari penerimaan) atau
// dari customer (dari pengiriman), selalu merujuk transfer Selesai. Konfirmasi membuat transfer
// retur; baris "dengan pengganti" membuat transfer pengganti setelah retur Selesai.
export const RETURN_REQUEST_TYPES = ["vendor", "customer"] as const
export type ReturnRequestType = (typeof RETURN_REQUEST_TYPES)[number]

export const RETURN_REQUEST_TYPE_LABELS: Record<ReturnRequestType, string> = {
  vendor: "Ke vendor",
  customer: "Dari customer",
}

export const RETURN_REQUEST_STATUSES = ["draft", "in_progress", "done", "cancelled"] as const
export type ReturnRequestStatus = (typeof RETURN_REQUEST_STATUSES)[number]

export const RETURN_REQUEST_STATUS_LABELS: Record<ReturnRequestStatus, string> = {
  draft: "Draft",
  in_progress: "Diproses",
  done: "Selesai",
  cancelled: "Batal",
}

export const RETURN_REQUEST_STATUS_TONES: Record<
  ReturnRequestStatus,
  "neutral" | "info" | "success" | "warning"
> = {
  draft: "neutral",
  in_progress: "warning",
  done: "success",
  cancelled: "neutral",
}

export const RETURN_LINE_ACTIONS = ["return", "replace"] as const
export type ReturnLineAction = (typeof RETURN_LINE_ACTIONS)[number]

export const RETURN_LINE_ACTION_LABELS: Record<ReturnLineAction, string> = {
  return: "Retur saja",
  replace: "Retur dengan pengganti",
}

// Klasifikasi transaksi saat validasi (backlog R-08, transaction_classification hmx-002): tanggal
// efektif mundur (backdate) dan/atau qty selesai kurang dari qty diminta (dengan transfer lanjutan
// atau sisanya dibuang). Kosong = transaksi biasa.
export const TRANSACTION_CLASSIFICATIONS = [
  "backdate",
  "backorder",
  "no_backorder",
  "backdate_backorder",
  "backdate_no_backorder",
] as const
export type TransactionClassification = (typeof TRANSACTION_CLASSIFICATIONS)[number]

export const TRANSACTION_CLASSIFICATION_LABELS: Record<TransactionClassification, string> = {
  backdate: "Backdate",
  backorder: "Backorder",
  no_backorder: "Sisa dibuang",
  backdate_backorder: "Backdate, backorder",
  backdate_no_backorder: "Backdate, sisa dibuang",
}

// Status baris pergerakan: mengikuti transfernya, tanpa tahap Siap.
export const STOCK_MOVE_STATUSES = ["draft", "done", "cancelled"] as const
export type StockMoveStatus = (typeof STOCK_MOVE_STATUSES)[number]

// Sesi stock opname (PRD bagian 6.5, backlog R-13, stock_count hmx-002): Draft → Berjalan (daftar
// hitung dan qty sistem diambil dari saldo, gudang dibekukan) → Selesai hitung → Menunggu
// persetujuan → Disetujui (gudang dibuka); ditolak kembali ke Selesai hitung; Batal membuka gudang.
export const STOCK_COUNT_STATUSES = [
  "draft",
  "counting",
  "counted",
  "review",
  "approved",
  "cancelled",
] as const
export type StockCountStatus = (typeof STOCK_COUNT_STATUSES)[number]

export const STOCK_COUNT_STATUS_LABELS: Record<StockCountStatus, string> = {
  draft: "Draft",
  counting: "Berjalan",
  counted: "Selesai hitung",
  review: "Menunggu persetujuan",
  approved: "Disetujui",
  cancelled: "Batal",
}

// Qty hitung awal saat mulai hitung (I-04).
export const STOCK_COUNT_INITIAL_COUNTED = ["empty", "zero", "system"] as const
export type StockCountInitialCounted = (typeof STOCK_COUNT_INITIAL_COUNTED)[number]

export const STOCK_COUNT_INITIAL_COUNTED_LABELS: Record<StockCountInitialCounted, string> = {
  empty: "Kosong, wajib diisi",
  zero: "0",
  system: "Sama dengan qty sistem",
}

// Status yang membekukan gudang: transfer di gudang itu tidak bisa divalidasi.
export const FROZEN_STOCK_COUNT_STATUSES: readonly StockCountStatus[] = [
  "counting",
  "counted",
  "review",
]

// Label jenis pergerakan untuk kartu stok dan penelusuran lot: kode pu dirinci per jenis pemakaian
// (R-12, R-14).
export function movementLabel(code: MovementCode, usageType?: UsageType | null) {
  return code === "pu" && usageType ? USAGE_TYPE_LABELS[usageType] : MOVEMENT_CODE_LABELS[code]
}
