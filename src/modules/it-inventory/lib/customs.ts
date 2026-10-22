// Dokumen kepabeanan (BC), PRD bagian 7 dan 13. Semua jenis disimpan di satu set tabel
// customs_* yang dibedakan doc_code; tampilan tetap terpisah per jenis (keputusan 17/10/2026).
// Dipakai bersama oleh schema, server, dan UI.

// Kode dokumen sama dengan kodeDokumen CEISA, supaya payload tidak perlu dipetakan lagi. Lima
// jenis pertama MVP; sisanya jadwal PRD fase 2 dan 3. Semua jenis sudah punya form dan memilih
// transfer sesuai DOCUMENT_SOURCE_MAP hmx. P3BET memakai kode CEISA 331.
export const CUSTOMS_DOC_CODES = [
  "23",
  "40",
  "25",
  "30",
  "41",
  "20",
  "261",
  "262",
  "27",
  "16",
  "28",
  "33",
  "331",
] as const
export type CustomsDocCode = (typeof CUSTOMS_DOC_CODES)[number]

export const CUSTOMS_DOC_CODE_LABELS: Record<CustomsDocCode, string> = {
  "23": "BC 2.3",
  "40": "BC 4.0",
  "25": "BC 2.5",
  "30": "BC 3.0",
  "41": "BC 4.1",
  "20": "BC 2.0",
  "261": "BC 2.6.1",
  "262": "BC 2.6.2",
  "27": "BC 2.7",
  "16": "BC 1.6",
  "28": "BC 2.8",
  "33": "BC 3.3",
  "331": "P3BET",
}

// Arah dokumen (PRD 7.1): masuk ke atau keluar dari kawasan berikat. Sama dengan
// customs_doc_direction() di database. BC 2.7 dan 3.3 dipakai dua arah di hmx; di sini dicatat
// sebagai keluar (dokumen dibuat pihak pengirim) sampai aturan gerbangnya diputuskan.
export const CUSTOMS_DOC_DIRECTIONS: Record<CustomsDocCode, "in" | "out"> = {
  "23": "in",
  "40": "in",
  "25": "out",
  "30": "out",
  "41": "out",
  "20": "in",
  "261": "out",
  "262": "in",
  "27": "out",
  "16": "in",
  "28": "out",
  "33": "out",
  "331": "out",
}

// Status dokumen (PRD 7.3). "Gagal kirim" baru ada di fase 2 (CEISA).
// Status dokumen BC seperti hmx-002 document_state.py (backlog H-01): Submitted = final, terkunci.
export const CUSTOMS_DOCUMENT_STATUSES = ["draft", "submitted"] as const
export type CustomsDocumentStatus = (typeof CUSTOMS_DOCUMENT_STATUSES)[number]

export const CUSTOMS_DOCUMENT_STATUS_LABELS: Record<CustomsDocumentStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
}

// Bagian dokumen yang diperiksa aturan validasi (doc_validation_rules, M3-03). field berisi nama
// kolom (header, line, transport, package, container), kunci details, kode entitas CEISA (party),
// atau kode jenis dokumen lampiran (attachment).
export const CUSTOMS_RULE_TARGETS = [
  "header",
  "details",
  "party",
  "line",
  "attachment",
  "transport",
  "package",
  "container",
] as const
export type CustomsRuleTarget = (typeof CUSTOMS_RULE_TARGETS)[number]

export const CUSTOMS_DOCUMENT_STATUS_TONES: Record<
  CustomsDocumentStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  draft: "neutral",
  submitted: "success",
}

// Filter tanggal aju di daftar dokumen (M3-13), dihitung dalam WIB oleh database.
export const CUSTOMS_PERIODS = ["bulan-ini", "bulan-lalu", "3-bulan", "tahun-ini"] as const
export type CustomsPeriod = (typeof CUSTOMS_PERIODS)[number]

export const CUSTOMS_PERIOD_LABELS: Record<CustomsPeriod, string> = {
  "bulan-ini": "Bulan ini",
  "bulan-lalu": "Bulan lalu",
  "3-bulan": "3 bulan terakhir",
  "tahun-ini": "Tahun ini",
}

// Sumber transfer yang boleh dipilih per jenis dokumen (DOCUMENT_SOURCE_MAP hmx-002, backlog H-01):
// penerimaan gr, pengiriman gi, antar gudang itw_in/itw_out; status Siap atau Selesai. Sama dengan
// customs_document_source_codes() di database.
export const CUSTOMS_DOCUMENT_SOURCE_CODES: Record<CustomsDocCode, readonly string[]> = {
  "16": ["gr"],
  "20": ["gr"],
  "23": ["itw_in", "itw_out", "gr"],
  "25": ["gi"],
  "27": ["itw_in", "itw_out", "gr", "gi"],
  "261": ["gi"],
  "262": ["gr"],
  "28": ["gi"],
  "30": ["gi"],
  "33": ["gr", "gi"],
  "331": ["gi"],
  "40": ["itw_in", "itw_out", "gr"],
  "41": ["itw_in", "itw_out", "gi"],
}

// Jenis sumber di pemilih transfer (SOURCE_TRANSFER_CODES hmx, H-04), urut seperti sidebar
// hx-it-inventory-transfer-selector.
export const CUSTOMS_SOURCE_TYPES = {
  gi: { label: "Pengiriman", description: "Good Issue, barang keluar", codes: ["gi"] },
  gr: { label: "Penerimaan", description: "Good Receiving, barang masuk", codes: ["gr"] },
  itw: {
    label: "Transfer antar gudang",
    description: "Kaki keluar dan masuk antar gudang",
    codes: ["itw_in", "itw_out"],
  },
} as const satisfies Record<
  string,
  { label: string; description: string; codes: readonly string[] }
>
export type CustomsSourceType = keyof typeof CUSTOMS_SOURCE_TYPES

export function customsSourceTypes(docCode: CustomsDocCode): CustomsSourceType[] {
  return (Object.keys(CUSTOMS_SOURCE_TYPES) as CustomsSourceType[]).filter((source) =>
    CUSTOMS_SOURCE_TYPES[source].codes.some((code) =>
      CUSTOMS_DOCUMENT_SOURCE_CODES[docCode].includes(code),
    ),
  )
}

// Flow Dokumen (DOCUMENT_FLOW_IN/OUT/MAP hmx-002, H-06): pasangan dokumen masuk → keluar.
export const CUSTOMS_FLOW_IN = [
  { code: "16", name: "IN 1.6", description: "Pemasukan barang" },
  { code: "40", name: "IN 4.0", description: "Barang asal dalam negeri" },
  { code: "33", name: "IN 3.3", description: "Dokumen kawasan bebas" },
  { code: "27", name: "IN 2.7", description: "Perpindahan kawasan" },
] as const satisfies readonly { code: CustomsDocCode; name: string; description: string }[]
export const CUSTOMS_FLOW_OUT = [
  { code: "28", name: "OUT 2.8", description: "Pengeluaran dari PLB" },
  { code: "27", name: "OUT 2.7", description: "Pengeluaran antar kawasan" },
  { code: "331", name: "OUT P3BET", description: "Pemberitahuan terkait" },
  { code: "41", name: "OUT 4.1", description: "Pengeluaran ke dalam negeri" },
  { code: "33", name: "OUT 3.3", description: "Pengeluaran kawasan bebas" },
] as const satisfies readonly { code: CustomsDocCode; name: string; description: string }[]
export const CUSTOMS_FLOW_MAP: Partial<Record<CustomsDocCode, readonly CustomsDocCode[]>> = {
  "16": ["28", "27", "331"],
  "40": ["41", "33", "27"],
  "33": ["331"],
  "27": ["28", "41", "33"],
}
