// Kolom ringkas barang BC dipakai sama pada mode baca dan edit; rincian dibuka per baris.
export const CUSTOMS_LINE_FIELDS = [
  { id: "product", label: "Produk", required: true },
  { id: "hsCode", label: "Kode HS" },
  { id: "description", label: "Uraian", optional: true },
  { id: "stockQty", label: "Jumlah dalam Satuan Stok", required: true, numeric: true },
] as const
