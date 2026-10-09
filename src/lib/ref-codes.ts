// Jenis referensi kepabeanan (PRD bagian 5.2). Semua disimpan di satu tabel
// ref_codes, dibedakan oleh kolom type. Dipakai bersama oleh server dan UI.

export const REF_CODE_TYPES = [
  "document_type",
  "customs_office",
  "domestic_port",
  "foreign_port",
  "tps",
  "country",
  "currency",
  "package_type",
  "container_size",
  "container_type",
  "facility",
  "levy_type",
  "incoterm",
  "transport_mode",
  "entity_type",
  "response",
  "hs_code",
  "ceisa_unit",
] as const
export type RefCodeType = (typeof REF_CODE_TYPES)[number]

export const REF_CODE_TYPE_LABELS: Record<RefCodeType, string> = {
  document_type: "Jenis dokumen",
  customs_office: "Kantor pabean",
  domestic_port: "Pelabuhan dalam negeri",
  foreign_port: "Pelabuhan luar negeri",
  tps: "TPS",
  country: "Negara",
  currency: "Valuta",
  package_type: "Jenis kemasan",
  container_size: "Ukuran kontainer",
  container_type: "Tipe kontainer",
  facility: "Fasilitas",
  levy_type: "Jenis pungutan",
  incoterm: "Incoterm",
  transport_mode: "Cara angkut",
  entity_type: "Jenis entitas",
  response: "Respon",
  hs_code: "Kode HS",
  ceisa_unit: "Satuan CEISA",
}

// Jenis yang kodenya hanya unik di dalam induknya. parent_code menunjuk ke kode
// dari jenis induk ini: TPS per kantor pabean, pelabuhan luar negeri per negara.
export const REF_CODE_PARENT_TYPES: Partial<Record<RefCodeType, RefCodeType>> = {
  tps: "customs_office",
  foreign_port: "country",
}

// Satu pilihan di komponen [kode] nama, juga bentuk respons /api/ref-codes.
export type RefCodeOption = {
  code: string
  name: string
  parentCode: string | null
}

// Tampilan standar di semua pilihan: [kode] nama.
export function formatRefCode(item: { code: string; name: string }) {
  return `[${item.code}] ${item.name}`
}
