import type { ProductTracking } from "./inventory"

// Rincian lot/nomor seri penerimaan (backlog RU-03), dipakai editor di detail penerimaan dan layar
// scan. Qty dalam satuan stok. Lot kosong = nomor otomatis saat validasi (produk ber-nomor otomatis).

export type LotRow = { lot: string; qty: string }

export type ScanResult =
  { ok: true; rows: LotRow[]; message: string } | { ok: false; message: string }

const parseQty = (value: string) => Number(value.trim().replace(",", ".")) || 0

export function lotRowsTotal(rows: LotRow[]) {
  return rows.reduce((sum, row) => sum + parseQty(row.qty), 0)
}

// Satu scan kode lot/nomor seri: nomor seri baru jadi satu rincian ber-qty 1, lot yang sudah ada
// bertambah 1. Scan yang membuat qty melebihi qty diminta ditolak.
export function addLotScan(
  rows: LotRow[],
  code: string,
  { tracking, requested }: { tracking: ProductTracking; requested: number },
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

// Data yang dikirim ke saveReceiptLots: baris kosong (tanpa lot dan qty) diabaikan.
export function lotRowsPayload(rows: LotRow[]) {
  return rows
    .filter((row) => row.lot.trim() || row.qty.trim())
    .map((row) => ({ lot: row.lot.trim() || null, qty: row.qty.trim() }))
}
