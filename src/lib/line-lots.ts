import type { ProductTracking } from "./inventory"

// Rincian lot/nomor seri per baris transfer (penerimaan RU-03, pengiriman I-01), dipakai editor di
// detail dan layar scan. Qty dalam satuan stok. Penerimaan: lot kosong = nomor otomatis saat
// validasi. Pengiriman: hanya lot yang ada stoknya di lokasi asal, maksimal sebanyak stok itu.

export type LotRow = { lot: string; qty: string }

export type ScanResult =
  { ok: true; rows: LotRow[]; message: string } | { ok: false; message: string }

const parseQty = (value: string) => Number(value.trim().replace(",", ".")) || 0

export function lotRowsTotal(rows: LotRow[]) {
  return rows.reduce((sum, row) => sum + parseQty(row.qty), 0)
}

// Satu scan kode lot/nomor seri: nomor seri baru jadi satu rincian ber-qty 1, lot yang sudah ada
// bertambah 1. Scan yang membuat qty melebihi qty diminta, atau melebihi stok lot (barang keluar,
// `available` diisi), ditolak.
export function addLotScan(
  rows: LotRow[],
  code: string,
  {
    tracking,
    requested,
    available,
  }: { tracking: ProductTracking; requested: number; available?: Record<string, number> },
): ScanResult {
  const lot = code.trim()
  if (!lot) return { ok: false, message: "Kode kosong." }
  if (tracking === "none") {
    return { ok: false, message: "Produk ini tidak dilacak per lot atau nomor seri." }
  }
  if (lotRowsTotal(rows) + 1 > requested) {
    return { ok: false, message: "Qty sudah sama dengan qty diminta." }
  }
  const index = rows.findIndex((row) => row.lot.trim() === lot)
  if (available) {
    const stock = available[lot] ?? 0
    if (stock <= 0) return { ok: false, message: `${lot} tidak ada stoknya di lokasi asal.` }
    if ((index >= 0 ? parseQty(rows[index].qty) : 0) + 1 > stock) {
      return { ok: false, message: `Stok ${lot} di lokasi asal hanya ${stock}.` }
    }
  }
  if (tracking === "serial") {
    if (index >= 0) return { ok: false, message: `Nomor seri ${lot} sudah dipindai.` }
    return {
      ok: true,
      rows: [...rows, { lot, qty: "1" }],
      message: `Nomor seri ${lot} ditambahkan.`,
    }
  }
  if (index < 0) {
    return { ok: true, rows: [...rows, { lot, qty: "1" }], message: `Lot ${lot}: 1.` }
  }
  const qty = parseQty(rows[index].qty) + 1
  return {
    ok: true,
    rows: rows.map((row, i) => (i === index ? { ...row, qty: String(qty) } : row)),
    message: `Lot ${lot}: ${qty}.`,
  }
}

// Data yang dikirim ke saveLineLots: baris kosong (tanpa lot dan qty) diabaikan.
export function lotRowsPayload(rows: LotRow[]) {
  return rows
    .filter((row) => row.lot.trim() || row.qty.trim())
    .map((row) => ({ lot: row.lot.trim() || null, qty: row.qty.trim() }))
}
