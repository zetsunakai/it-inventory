// Dokumen kepabeanan (BC), PRD bagian 7 dan 13. Semua jenis disimpan di satu set tabel
// customs_* yang dibedakan doc_code; tampilan tetap terpisah per jenis (keputusan 17/10/2026).
// Dipakai bersama oleh schema, server, dan UI.

// Kode dokumen sama dengan kodeDokumen CEISA, supaya payload tidak perlu dipetakan lagi.
export const CUSTOMS_DOC_CODES = ["23", "40", "25", "30", "41"] as const
export type CustomsDocCode = (typeof CUSTOMS_DOC_CODES)[number]

export const CUSTOMS_DOC_CODE_LABELS: Record<CustomsDocCode, string> = {
  "23": "BC 2.3",
  "40": "BC 4.0",
  "25": "BC 2.5",
  "30": "BC 3.0",
  "41": "BC 4.1",
}

// Arah dokumen (PRD 7.1): masuk ke atau keluar dari kawasan berikat. Sama dengan
// customs_doc_direction() di database.
export const CUSTOMS_DOC_DIRECTIONS: Record<CustomsDocCode, "in" | "out"> = {
  "23": "in",
  "40": "in",
  "25": "out",
  "30": "out",
  "41": "out",
}

// Status dokumen (PRD 7.3). "Gagal kirim" baru ada di fase 2 (CEISA).
export const CUSTOMS_DOCUMENT_STATUSES = [
  "draft",
  "ready",
  "submitted",
  "registered",
  "rejected",
  "cancelled",
] as const
export type CustomsDocumentStatus = (typeof CUSTOMS_DOCUMENT_STATUSES)[number]

export const CUSTOMS_DOCUMENT_STATUS_LABELS: Record<CustomsDocumentStatus, string> = {
  draft: "Draft",
  ready: "Siap ajukan",
  submitted: "Diajukan",
  registered: "Terdaftar",
  rejected: "Ditolak",
  cancelled: "Batal",
}
