import type { CustomsDocCode } from "./customs"
import type { CustomsFormSpec } from "./customs-form"
import { CUSTOMS_LAYOUTS } from "./customs-layouts.generated"

// Form per jenis dokumen BC (backlog M3-05–M3-09, D-01–D-08, D-09): tab, grup, field, dan label
// dari form hmx core_it_inventory (customs-layouts.generated.ts); di sini hanya judul, deskripsi,
// dan path menunya.

const spec = (
  code: CustomsDocCode,
  title: string,
  description: string,
  path: string,
): CustomsFormSpec => ({ code, title, description, path, ...CUSTOMS_LAYOUTS[code] })

export const BC23 = spec(
  "23",
  "BC 2.3",
  "Impor barang dari luar negeri untuk ditimbun di kawasan berikat.",
  "/dokumen-bc/bc23",
)
export const BC40 = spec(
  "40",
  "BC 4.0",
  "Pemasukan barang dari pemasok dalam negeri (TLDDP) ke kawasan berikat.",
  "/dokumen-bc/bc40",
)
export const BC25 = spec(
  "25",
  "BC 2.5",
  "Pengeluaran barang dari kawasan berikat ke pembeli dalam negeri (TLDDP).",
  "/dokumen-bc/bc25",
)
export const BC41 = spec(
  "41",
  "BC 4.1",
  "Pengeluaran kembali barang asal dalam negeri dari kawasan berikat.",
  "/dokumen-bc/bc41",
)
export const BC30 = spec(
  "30",
  "BC 3.0",
  "Ekspor barang dari kawasan berikat ke luar negeri (PEB).",
  "/dokumen-bc/bc30",
)
export const BC20 = spec(
  "20",
  "BC 2.0",
  "Impor barang dari luar negeri untuk dipakai (PIB).",
  "/dokumen-bc/bc20",
)
export const BC261 = spec(
  "261",
  "BC 2.6.1",
  "Pengeluaran sementara barang dari kawasan berikat ke dalam negeri dengan jaminan, mis. untuk diperbaiki atau disubkontrakkan.",
  "/dokumen-bc/bc261",
)
export const BC262 = spec(
  "262",
  "BC 2.6.2",
  "Pemasukan kembali barang yang sebelumnya dikeluarkan sementara dengan BC 2.6.1.",
  "/dokumen-bc/bc262",
)
export const BC27 = spec(
  "27",
  "BC 2.7",
  "Pengiriman barang dari kawasan berikat ke tempat penimbunan berikat lain.",
  "/dokumen-bc/bc27",
)
export const BC16 = spec(
  "16",
  "BC 1.6",
  "Pemasukan barang dari luar negeri untuk ditimbun di pusat logistik berikat (PLB).",
  "/dokumen-bc/bc16",
)
export const BC28 = spec(
  "28",
  "BC 2.8",
  "Pengeluaran barang impor dari pusat logistik berikat untuk dipakai di dalam negeri.",
  "/dokumen-bc/bc28",
)
export const BC33 = spec(
  "33",
  "BC 3.3",
  "Ekspor barang melalui atau dari pusat logistik berikat (PLB).",
  "/dokumen-bc/bc33",
)
export const P3BET = spec(
  "331",
  "P3BET",
  "Pemberitahuan penggabungan dan pemecahan barang ekspor serta transhipment dari pusat logistik berikat.",
  "/dokumen-bc/p3bet",
)

export const CUSTOMS_SPECS: Record<CustomsDocCode, CustomsFormSpec> = {
  "23": BC23,
  "40": BC40,
  "25": BC25,
  "41": BC41,
  "30": BC30,
  "20": BC20,
  "261": BC261,
  "262": BC262,
  "27": BC27,
  "16": BC16,
  "28": BC28,
  "33": BC33,
  "331": P3BET,
}
