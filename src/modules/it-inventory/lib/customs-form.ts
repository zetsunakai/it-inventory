import { z } from "zod"

import type { FieldSpan } from "@/components/form-field"
import { parseDecimalInput } from "@/lib/decimal"
import type { RefCodeType } from "@/lib/ref-codes"

import type { CustomsDocCode } from "./customs"

// Form dokumen BC (backlog M3-04, keputusan user 17/10/2026): setiap jenis dokumen punya menu dan
// form sendiri seperti hmx, dirakit dari bagian yang sama (tab Header, Entitas, Dokumen,
// Pengangkut, Kemasan dan Peti Kemas, Barang, Pungutan, Transaksi, Pernyataan). Isi setiap bagian
// diatur CustomsFormSpec jenisnya; data tetap satu set tabel customs_* per doc_code.

// Daftar kode CEISA yang pendek dan tetap (dari data hmx core_it_inventory), tampil sebagai
// pilihan biasa. Kode yang panjang (kantor, pelabuhan, HS, dst.) ada di referensi kepabeanan.
export const CUSTOMS_OPTION_LISTS = {
  // Fasilitas tarif pungutan (kodeFasilitasTarif).
  taxFacility: [
    ["1", "Dibayar"],
    ["2", "Ditanggung pemerintah"],
    ["3", "Ditangguhkan"],
    ["4", "Berkala"],
    ["5", "Dibebaskan"],
    ["6", "Tidak dipungut"],
    ["7", "Sudah dilunasi"],
    ["8", "Dijaminkan"],
    ["9", "Ditunda"],
  ],
  tpbType: [
    ["1", "Kawasan Berikat"],
    ["2", "Gudang Berikat"],
    ["3", "TPPB"],
    ["4", "TBB"],
    ["5", "TLB"],
    ["6", "KDUB"],
    ["7", "Lainnya"],
  ],
  // Tujuan pengeluaran BC 2.5 dan 4.1.
  deliveryReason: [
    ["1", "Penyerahan BKP"],
    ["2", "Penyerahan JKP"],
    ["3", "Retur"],
    ["4", "Non penyerahan"],
    ["5", "Lainnya"],
  ],
  paymentTerm: [
    ["1", "Biasa/tunai"],
    ["2", "Berkala"],
    ["3", "Dengan jaminan"],
    ["4", "Perhitungan kemudian"],
    ["5", "Konsinyasi"],
    ["6", "Usance L/C"],
    ["7", "Red clause L/C"],
    ["8", "Inter-company account"],
    ["9", "Gabungan/lainnya"],
    ["15", "Pembayaran di muka"],
    ["16", "Sight L/C"],
    ["17", "Inkaso"],
  ],
  exportCategory: [
    ["10", "Umum"],
    ["21", "NIPER dengan pembebasan"],
    ["22", "NIPER dengan pengembalian"],
    ["23", "KITE dengan pembebasan dan pengembalian"],
    ["41", "TPB dari kawasan berikat"],
    ["42", "TPB dari gudang berikat"],
    ["51", "PLB"],
  ],
  insuranceType: [
    ["LN", "Luar negeri"],
    ["DN", "Dalam negeri"],
  ],
  // Jenis muatan peti kemas (kodeJenisKontainer).
  containerLoad: [
    ["8", "FCL"],
    ["7", "LCL"],
    ["4", "Kosong"],
  ],
  // Jenis identitas entitas (kodeJenisIdentitas).
  identityType: [
    ["6", "NPWP 16 digit"],
    ["5", "NPWP 15 digit"],
    ["2", "Paspor"],
    ["3", "KTP"],
    ["4", "Lainnya"],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>
export type CustomsOptionList = keyof typeof CUSTOMS_OPTION_LISTS

export function customsOptionLabel(list: CustomsOptionList, code: string) {
  return CUSTOMS_OPTION_LISTS[list].find(([value]) => value === code)?.[1] ?? code
}

// Kolom header yang diisi di form (status, nomor daftar, dan respon diubah lewat alur status).
export const CUSTOMS_HEADER_COLUMNS = [
  "customsOfficeCode",
  "currencyCode",
  "ndpbm",
  "cifValue",
  "fobValue",
  "freightValue",
  "insuranceValue",
  "deliveryPrice",
  "grossWeight",
  "netWeight",
  "signerName",
  "signerPosition",
  "signerCity",
  "signedDate",
  "notes",
] as const
export type CustomsHeaderColumn = (typeof CUSTOMS_HEADER_COLUMNS)[number]

export const CUSTOMS_LINE_COLUMNS = [
  "hsCode",
  "description",
  "brand",
  "itemType",
  "itemSize",
  "specification",
  "qty",
  "ceisaUnitCode",
  "stockQty",
  "packageQty",
  "packageTypeCode",
  "netWeight",
  "originCountryCode",
  "unitPrice",
  "invoiceValue",
  "cifValue",
  "fobValue",
  "freightValue",
  "insuranceValue",
  "deliveryPrice",
  "customsValue",
] as const
export type CustomsLineColumn = (typeof CUSTOMS_LINE_COLUMNS)[number]

// Jenis isian: teks, tanggal, uang (2 desimal), qty/berat/kurs (4 desimal), kode referensi
// kepabeanan, atau pilihan dari CUSTOMS_OPTION_LISTS.
export type CustomsFieldKind =
  | { kind: "text"; long?: boolean; mono?: boolean }
  | { kind: "date" }
  | { kind: "money" }
  | { kind: "qty" }
  | { kind: "ref"; refType: RefCodeType }
  | { kind: "option"; list: CustomsOptionList }

// Satu isian header atau baris. key = kolom tabel (CUSTOMS_HEADER_COLUMNS/CUSTOMS_LINE_COLUMNS)
// atau, dengan detail: true, kunci di kolom details (camelCase, sama dengan doc_validation_rules).
export type CustomsField = CustomsFieldKind & {
  key: string
  label: string
  detail?: boolean
  span?: FieldSpan
}

export type CustomsPartySpec = {
  // Kode entitas CEISA (ref_codes entity_type).
  code: string
  label: string
  // company = diisi dari profil perusahaan; partner = dipilih dari master partner.
  source: "company" | "partner"
  // Alamat negara dan izin TPB ditampilkan bila dipakai jenis ini.
  country?: boolean
  permit?: boolean
}

export type CustomsFormSpec = {
  code: CustomsDocCode
  // Mis. "BC 2.3"; judul menu dan halaman.
  title: string
  // Nama panjang untuk deskripsi halaman.
  description: string
  // Path menu, mis. /dokumen-bc/bc23.
  path: string
  header: CustomsField[]
  parties: CustomsPartySpec[]
  // null = tab Pengangkut tidak tampil.
  transport: { fields: CustomsField[] } | null
  containers: boolean
  transaction: CustomsField[]
  line: CustomsField[]
  // Jenis pungutan yang disiapkan untuk barang baru; null = tab Pungutan tidak tampil.
  taxes: string[] | null
}

// Isian yang sama di semua jenis.
export const CUSTOMS_STATEMENT_FIELDS: CustomsField[] = [
  { key: "signerCity", label: "Kota pernyataan", kind: "text", span: 6 },
  { key: "signedDate", label: "Tanggal pernyataan", kind: "date", span: 6 },
  { key: "signerName", label: "Nama penandatangan", kind: "text", span: 6 },
  { key: "signerPosition", label: "Jabatan penandatangan", kind: "text", span: 6 },
]

export const CUSTOMS_LINE_BASE_FIELDS: CustomsField[] = [
  { key: "hsCode", label: "Kode HS", kind: "ref", refType: "hs_code", span: 4 },
  { key: "description", label: "Uraian barang", kind: "text", span: 8 },
  { key: "brand", label: "Merek", kind: "text", span: 4 },
  { key: "itemType", label: "Tipe", kind: "text", span: 4 },
  { key: "itemSize", label: "Ukuran", kind: "text", span: 4 },
  { key: "qty", label: "Jumlah satuan", kind: "qty", span: 3 },
  { key: "ceisaUnitCode", label: "Satuan CEISA", kind: "ref", refType: "ceisa_unit", span: 3 },
  { key: "stockQty", label: "Jumlah dalam satuan stok", kind: "qty", span: 3 },
  { key: "netWeight", label: "Berat bersih (kg)", kind: "qty", span: 3 },
  { key: "packageQty", label: "Jumlah kemasan", kind: "qty", span: 3 },
  { key: "packageTypeCode", label: "Jenis kemasan", kind: "ref", refType: "package_type", span: 3 },
]

// ---------------------------------------------------------------------------------------------
// Data form: semua nilai berupa teks ("" = kosong), dikirim sebagai satu JSON (field "document").

export type CustomsPartyDraft = {
  entityTypeCode: string
  partnerId: string | null
  name: string
  address: string
  countryCode: string
  identityTypeCode: string
  identityNumber: string
  nib: string
  permitNumber: string
  permitDate: string
}

export type CustomsTaxDraft = {
  levyTypeCode: string
  rate: string
  facilityCode: string
  facilityRate: string
  amount: string
}

export type CustomsLineDraft = Record<CustomsLineColumn, string> & {
  productId: string
  // Hanya untuk tampilan pilihan produk.
  product: { id: string; sku: string; name: string } | null
  details: Record<string, string>
  taxes: CustomsTaxDraft[]
}

export type CustomsAttachmentDraft = { documentTypeCode: string; number: string; date: string }
export type CustomsPackageDraft = { qty: string; packageTypeCode: string; marks: string }
export type CustomsContainerDraft = {
  number: string
  sizeCode: string
  typeCode: string
  loadTypeCode: string
}
export type CustomsTransportDraft = {
  transportModeCode: string
  name: string
  voyageNumber: string
  flagCountryCode: string
}

export type CustomsDocumentDraft = {
  header: Record<CustomsHeaderColumn, string>
  details: Record<string, string>
  parties: CustomsPartyDraft[]
  lines: CustomsLineDraft[]
  attachments: CustomsAttachmentDraft[]
  packages: CustomsPackageDraft[]
  containers: CustomsContainerDraft[]
  transports: CustomsTransportDraft[]
}

export function emptyLine(taxes: string[] | null): CustomsLineDraft {
  return {
    ...(Object.fromEntries(CUSTOMS_LINE_COLUMNS.map((key) => [key, ""])) as Record<
      CustomsLineColumn,
      string
    >),
    productId: "",
    product: null,
    details: {},
    taxes: (taxes ?? []).map((levyTypeCode) => ({
      levyTypeCode,
      rate: "",
      facilityCode: "",
      facilityRate: "",
      amount: "",
    })),
  }
}

export function emptyDraft(spec: CustomsFormSpec): CustomsDocumentDraft {
  return {
    header: Object.fromEntries(CUSTOMS_HEADER_COLUMNS.map((key) => [key, ""])) as Record<
      CustomsHeaderColumn,
      string
    >,
    details: {},
    parties: [],
    lines: [emptyLine(spec.taxes)],
    attachments: [{ documentTypeCode: "380", number: "", date: "" }],
    packages: [],
    containers: [],
    transports: spec.transport ? [emptyTransport()] : [],
  }
}

export function emptyTransport(): CustomsTransportDraft {
  return { transportModeCode: "", name: "", voyageNumber: "", flagCountryCode: "" }
}

// ---------------------------------------------------------------------------------------------
// Validasi input di server. Kelengkapan (field wajib) TIDAK dicek di sini: Draft boleh belum
// lengkap; kelengkapan diperiksa aturan validasi database (M3-03) saat menuju Siap ajukan.

const text = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} maksimal ${max} karakter.`)
    .transform((value) => value || null)

const code = text("Kode", 30)

// Angka ≥ 0 dengan maksimal `scale` desimal, kosong = null.
function amount(label: string, scale: number) {
  return z.string().transform((value, ctx) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^0+([.,]0*)?$/.test(trimmed)) return "0"
    const parsed = parseDecimalInput(trimmed, scale)
    if (!parsed) {
      ctx.addIssue({
        code: "custom",
        message: `${label} harus angka, maksimal ${scale} desimal.`,
      })
      return z.NEVER
    }
    return parsed
  })
}

const date = (label: string) =>
  z
    .string()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), `${label} tidak valid.`)
    .transform((value) => value || null)

const HEADER_KINDS: Record<CustomsHeaderColumn, z.ZodType<string | null, string>> = {
  customsOfficeCode: code,
  currencyCode: code,
  ndpbm: amount("NDPBM", 4),
  cifValue: amount("Nilai CIF", 2),
  fobValue: amount("Nilai FOB", 2),
  freightValue: amount("Freight", 2),
  insuranceValue: amount("Asuransi", 2),
  deliveryPrice: amount("Harga penyerahan", 2),
  grossWeight: amount("Berat kotor", 4),
  netWeight: amount("Berat bersih", 4),
  signerName: text("Nama penandatangan", 100),
  signerPosition: text("Jabatan penandatangan", 100),
  signerCity: text("Kota pernyataan", 100),
  signedDate: date("Tanggal pernyataan"),
  notes: text("Catatan", 2000),
}

function lineKinds(seq: number): Record<CustomsLineColumn, z.ZodType<string | null, string>> {
  const label = (name: string) => `Barang seri ${seq}: ${name}`
  return {
    hsCode: code,
    description: text(label("Uraian"), 1000),
    brand: text(label("Merek"), 100),
    itemType: text(label("Tipe"), 100),
    itemSize: text(label("Ukuran"), 100),
    specification: text(label("Spesifikasi"), 1000),
    qty: amount(label("Jumlah satuan"), 4),
    ceisaUnitCode: code,
    stockQty: amount(label("Jumlah dalam satuan stok"), 4),
    packageQty: amount(label("Jumlah kemasan"), 4),
    packageTypeCode: code,
    netWeight: amount(label("Berat bersih"), 4),
    originCountryCode: code,
    unitPrice: amount(label("Harga satuan"), 4),
    invoiceValue: amount(label("Harga invoice"), 2),
    cifValue: amount(label("Nilai CIF"), 2),
    fobValue: amount(label("Nilai FOB"), 2),
    freightValue: amount(label("Freight"), 2),
    insuranceValue: amount(label("Asuransi"), 2),
    deliveryPrice: amount(label("Harga penyerahan"), 2),
    customsValue: amount(label("Nilai pabean"), 2),
  }
}

const details = z
  .record(z.string(), z.string().max(1000, "Isian maksimal 1000 karakter."))
  .transform((value) =>
    Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, entry.trim()] as const)
        .filter(([, entry]) => entry !== ""),
    ),
  )

const partySchema = z.object({
  entityTypeCode: z.string().trim().min(1),
  partnerId: z.uuid().nullable(),
  name: text("Nama entitas", 200),
  address: text("Alamat entitas", 500),
  countryCode: code,
  identityTypeCode: code,
  identityNumber: text("Nomor identitas", 50),
  nib: text("NIB", 20),
  permitNumber: text("Nomor izin", 100),
  permitDate: date("Tanggal izin"),
})

const taxSchema = z.object({
  levyTypeCode: z.string().trim().min(1, "Jenis pungutan wajib dipilih."),
  rate: amount("Tarif", 4),
  facilityCode: code,
  facilityRate: amount("Tarif fasilitas", 4),
  amount: amount("Nilai pungutan", 2),
})

const lineSchema = z
  .object({
    productId: z.uuid("Produk barang wajib dipilih."),
    // Hanya untuk tampilan pilihan produk di form.
    product: z.unknown(),
    details,
    taxes: z.array(taxSchema),
  })
  .catchall(z.string())

export const customsDocumentInputSchema = z
  .object({
    header: z.record(z.string(), z.string()),
    details,
    parties: z.array(partySchema),
    lines: z.array(lineSchema),
    attachments: z.array(
      z.object({
        documentTypeCode: z.string().trim().min(1, "Jenis lampiran wajib dipilih."),
        number: text("Nomor lampiran", 100),
        date: date("Tanggal lampiran"),
      }),
    ),
    packages: z.array(
      z.object({
        qty: amount("Jumlah kemasan", 4),
        packageTypeCode: z.string().trim().min(1, "Jenis kemasan wajib dipilih."),
        marks: text("Merek kemasan", 200),
      }),
    ),
    containers: z.array(
      z.object({
        number: z.string().trim().min(1, "Nomor peti kemas wajib diisi.").max(30),
        sizeCode: code,
        typeCode: code,
        loadTypeCode: code,
      }),
    ),
    transports: z.array(
      z.object({
        transportModeCode: code,
        name: text("Nama sarana angkut", 200),
        voyageNumber: text("Nomor voyage/flight", 50),
        flagCountryCode: code,
      }),
    ),
  })
  .transform((input, ctx) => {
    const header = parseRecord(HEADER_KINDS, input.header, ctx)
    // parseRecord hanya membaca kolom baris, jadi product (tampilan) ikut terbuang.
    const lines = input.lines.map((line, index) => ({
      productId: line.productId,
      details: line.details,
      taxes: line.taxes,
      ...parseRecord(lineKinds(index + 1), line as unknown as Record<string, string>, ctx),
    }))
    const parties = input.parties.filter((party) => party.name)
    const packages = input.packages.filter((row) => row.qty !== null)
    const transports = input.transports.filter((row) => Object.values(row).some(Boolean))
    for (const [index, line] of lines.entries()) {
      const levies = line.taxes.map((tax) => tax.levyTypeCode)
      if (new Set(levies).size !== levies.length) {
        ctx.addIssue({
          code: "custom",
          message: `Barang seri ${index + 1}: jenis pungutan tidak boleh sama.`,
        })
      }
    }
    for (const row of packages) {
      if (row.qty === "0") ctx.addIssue({ code: "custom", message: "Jumlah kemasan harus > 0." })
    }
    const numbers = input.containers.map((row) => row.number.trim().toUpperCase())
    if (new Set(numbers).size !== numbers.length) {
      ctx.addIssue({ code: "custom", message: "Nomor peti kemas tidak boleh sama." })
    }
    return {
      header,
      details: input.details,
      parties,
      lines,
      attachments: input.attachments,
      packages,
      containers: input.containers.map((row, index) => ({ ...row, number: numbers[index] })),
      transports,
    }
  })

export type CustomsDocumentInput = z.output<typeof customsDocumentInputSchema>

function parseRecord<K extends string>(
  kinds: Record<K, z.ZodType<string | null, string>>,
  values: Record<string, string>,
  ctx: z.RefinementCtx,
) {
  const result = {} as Record<K, string | null>
  for (const key of Object.keys(kinds) as K[]) {
    const parsed = kinds[key].safeParse(values[key] ?? "")
    if (parsed.success) result[key] = parsed.data
    else {
      for (const issue of parsed.error.issues)
        ctx.addIssue({ code: "custom", message: issue.message })
      result[key] = null
    }
  }
  return result
}

// Field "document" form: JSON berisi CustomsDocumentDraft.
export const customsDocumentField = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown
    } catch {
      ctx.addIssue({ code: "custom", message: "Isi dokumen tidak valid." })
      return z.NEVER
    }
  })
  .pipe(customsDocumentInputSchema)
