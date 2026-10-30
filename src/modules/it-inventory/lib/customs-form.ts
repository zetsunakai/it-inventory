import { z } from "zod"

import type { FieldSpan } from "@/components/form-field"
import { formatDecimal, parseDecimalInput, toDecimalInput } from "@/lib/decimal"
import { formatRefCode, type RefCodeType } from "@/lib/ref-codes"

import type { CustomsDocCode } from "./customs"
import { HMX_OPTION_LISTS } from "./customs-layouts.generated"

// Form dokumen BC: setiap jenis punya menu dan form sendiri seperti hmx (keputusan user
// 17/10/2026), dengan tab, grup, field, dan label sama persis dengan form hmx (keputusan user
// 18/10/2026). Susunannya (CustomsLayout) dibangkitkan dari hmx oleh
// scripts/import-customs-forms-from-hmx.py; data tetap satu set tabel customs_* per doc_code.

// Daftar pilihan kode CEISA yang pendek (dari CHOICES model dan data hmx). Kode yang panjang
// (kantor, pelabuhan, HS, dst.) ada di referensi kepabeanan.
export const CUSTOMS_OPTION_LISTS = {
  ...HMX_OPTION_LISTS,
  // Satu kode bank satu pilihan; data sumber memuat beberapa nama untuk kode yang sama.
  bankDevisa: [...new Map(HMX_OPTION_LISTS.bankDevisa.map((item) => [item[0], item])).values()],
  submissionConsent: [
    ["1", "Ya"],
    ["0", "Tidak"],
  ],
  voluntaryDeclaration: [
    ["Y", "Ya"],
    ["T", "Tidak"],
  ],
} as const
export type CustomsOptionList = keyof typeof CUSTOMS_OPTION_LISTS

export const CUSTOMS_PRODUCT_CATEGORY_DOMAINS = {
  "25": ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
} as const
export const CUSTOMS_FACILITY_DOMAINS = { "40": ["3", "5", "6", "7"] } as const

export function customsOptionLabel(list: CustomsOptionList, code: string) {
  const items: readonly (readonly [string, string])[] = CUSTOMS_OPTION_LISTS[list]
  return items.find(([value]) => value === code)?.[1] ?? code
}

// Kolom header yang diisi di form (status dan respon diubah lewat alur status). No. Aju, Tgl. Aju,
// No. Daftar, dan Tgl. Daftar diisi manual dari portal CEISA seperti hmx (H-03).
export const CUSTOMS_HEADER_COLUMNS = [
  "ajuNumber",
  "ajuDate",
  "registrationNumber",
  "registrationDate",
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
  "itemCode",
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

// Jenis isian: teks, tanggal, uang (2 desimal), qty/berat/kurs (4 desimal),
// centang, kode referensi kepabeanan, pilihan dari CUSTOMS_OPTION_LISTS, pilihan produk (baris
// barang), atau file (lampiran).
export type CustomsFieldKind =
  | { kind: "text"; long?: boolean; mono?: boolean }
  | { kind: "date" }
  | { kind: "money" }
  | { kind: "qty" }
  | { kind: "boolean" }
  | { kind: "ref"; refType: RefCodeType; codes?: readonly string[] }
  | { kind: "option"; list: CustomsOptionList; codes?: readonly string[] }
  | { kind: "product" }
  | { kind: "file" }
  | { kind: "transfers" }

// Tempat nilai isian disimpan: kolom customs_documents (header) atau details-nya, kolom entitas
// peran role atau details-nya, sarana angkut pertama (transport), kolom baris barang (line) atau
// details-nya. Kolom sub-tabel (list) tidak memakai store. meta = isian header hmx yang tidak
// diketik: nomor urut, profil perusahaan, dan transfer yang dipilih (H-03, H-04).
export type CustomsFieldStore =
  "header" | "details" | "party" | "partyDetails" | "transport" | "line" | "lineDetails" | "meta"

export type CustomsField = CustomsFieldKind & {
  key: string
  label: string
  store?: CustomsFieldStore
  role?: string
  span?: FieldSpan
  required?: boolean
  readOnly?: boolean
}

// Beberapa isian sebaris di bawah satu label (grup side_by_side hmx, mis. Jenis Identitas).
export type CustomsFieldGroup = { group: string; fields: CustomsField[] }
export type CustomsFieldItem = CustomsField | CustomsFieldGroup

export type CustomsListKind =
  | "attachments"
  | "packages"
  | "containers"
  | "transports"
  | "taxes"
  | "guarantees"
  | "bankAccounts"
  | "owners"
  | "lines"
  | "vdEntries"

// Blok isian (grup berjudul hmx; role = blok entitas peran itu) atau daftar baris (sub-tabel).
export type CustomsFieldBlock = { title: string | null; role?: string; fields: CustomsFieldItem[] }
export type CustomsListBlock = { title: string; list: CustomsListKind; columns: CustomsField[] }
export type CustomsBlock = CustomsFieldBlock | CustomsListBlock
export type CustomsTab = { key: string; label: string; blocks: CustomsBlock[] }

export type CustomsPartySpec = {
  // Kode entitas CEISA (ref_codes entity_type; 23 = konsolidator).
  code: string
  // Judul grup entitas di form hmx, juga dipakai pesan validasi.
  label: string
  // company = diisi dari profil perusahaan; partner = dipilih dari master partner.
  source: "company" | "partner"
}

export type CustomsLayout = {
  // Header di atas tab (grup sheet form hmx): nomor urut, Inventory Transfer Documents, No. Aju,
  // No. Daftar, Tgl. Daftar, Perusahaan (H-03).
  top: CustomsField[]
  tabs: CustomsTab[]
  parties: CustomsPartySpec[]
  // Form Barang per jenis (document_product_views hmx) dan daftar Dokumen Lartas per barang.
  line: {
    blocks: CustomsBlock[]
    lartas: { title: string; columns: CustomsField[] } | null
  }
}

export type CustomsFormSpec = CustomsLayout & {
  code: CustomsDocCode
  // Mis. "BC 2.3"; judul menu dan halaman.
  title: string
  // Nama panjang untuk deskripsi halaman.
  description: string
  // Path menu, mis. /dokumen-bc/bc23.
  path: string
}

// Daftar Pemilik Barang (BC 3.0, 3.3, P3BET) disimpan sebagai entitas pemilik (kode 7) berseri.
export const OWNER_CODE = "7"

export const isFieldGroup = (item: CustomsFieldItem): item is CustomsFieldGroup => "group" in item
export const isListBlock = (block: CustomsBlock): block is CustomsListBlock => "list" in block

// Blok tab dikelompokkan: kemasan dan peti kemas yang berurutan jadi satu kelompok berdampingan.
export function sideBySide(blocks: CustomsBlock[]): CustomsBlock[][] {
  const paired = (block: CustomsBlock | undefined) =>
    block !== undefined &&
    isListBlock(block) &&
    (block.list === "packages" || block.list === "containers")
  const groups: CustomsBlock[][] = []
  for (const [index, block] of blocks.entries()) {
    const previous = groups.at(-1)
    if (previous?.length === 1 && paired(block) && paired(blocks[index - 1])) previous.push(block)
    else groups.push([block])
  }
  return groups
}

export function flatFields(items: CustomsFieldItem[]): CustomsField[] {
  return items.flatMap((item) => (isFieldGroup(item) ? item.fields : [item]))
}

// Semua isian dokumen yang diketik (bukan baris barang, kolom sub-tabel, atau isian meta header),
// urut sesuai form.
export function customsDocumentFields(spec: CustomsLayout): CustomsField[] {
  return [
    ...spec.top.filter((field) => field.store === "header"),
    ...spec.tabs.flatMap((tab) =>
      tab.blocks.flatMap((block) => (isListBlock(block) ? [] : flatFields(block.fields))),
    ),
  ]
}

// Isian form Barang (tanpa pilihan produk), urut sesuai form.
export function customsLineFields(spec: CustomsLayout): CustomsField[] {
  return spec.line.blocks.flatMap((block) =>
    isListBlock(block) ? [] : flatFields(block.fields).filter((field) => field.kind !== "product"),
  )
}

export function customsListBlock(spec: CustomsLayout, list: CustomsListKind) {
  for (const tab of spec.tabs) {
    for (const block of tab.blocks) {
      if (isListBlock(block) && block.list === list) return block
    }
  }
  return spec.line.blocks.find(
    (block): block is CustomsListBlock => isListBlock(block) && block.list === list,
  )
}

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
  // NITKU, status, jenis API, dst. (isian entitas hmx yang tidak punya kolom sendiri).
  details: Record<string, string>
}

// Daftar baris sederhana: nilai per kunci kolom.
export type CustomsRowDraft = Record<string, string>

// File lampiran (M3-10) diunggah lewat uploadCustomsAttachment, lalu kuncinya ikut disimpan.
export type CustomsAttachmentFile = {
  fileKey: string
  fileName: string
  contentType: string
  fileSize: number
}

export type CustomsAttachmentDraft = {
  documentTypeCode: string
  number: string
  date: string
  facilityCode: string
  permit: string
  officeCode: string
  file: CustomsAttachmentFile | null
}

export type CustomsLineDraft = Record<CustomsLineColumn, string> & {
  productId: string
  // Hanya untuk tampilan pilihan produk.
  product: { id: string; sku: string; name: string } | null
  details: Record<string, string>
  // Dokumen Lartas barang ini dan Voluntary Declaration (BC 2.0).
  attachments: CustomsAttachmentDraft[]
  vdEntries: CustomsRowDraft[]
  rawMaterials: CustomsRawMaterialDraft[]
  entities: CustomsLineEntityDraft[]
  duties: CustomsLineDutyDraft[]
}

// Structures anak pada rincian Equip3. Scalar khusus varian disimpan di details,
// sementara identitas relasi dan nilai operasional punya binding eksplisit.
export type CustomsRawMaterialDraft = {
  originCode: string
  productSerial: string
  productCode: string
  hsCode: string
  description: string
  quantity: string
  unitCode: string
  attachments: CustomsAttachmentDraft[]
  details: Record<string, string>
}
export type CustomsLineEntityDraft = {
  entityTypeCode: string
  partnerId: string | null
  name: string
  address: string
  identityNumber: string
  details: Record<string, string>
}
export type CustomsLineDutyDraft = {
  levyCode: "bm" | "ppn" | "ppnbm" | "pph" | "cukai" | "other"
  taxTypeCode: string
  rateTypeCode: string
  rate: string
  exemptAmount: string
  facilityCode: string
  paidAmount: string
  bmt: boolean
  excise: boolean
  details: Record<string, string>
}

export const CUSTOMS_TAX_PAYMENT_FIELDS = [
  { key: "paidAmount", label: "Dibayar" },
  { key: "governmentBorneAmount", label: "Ditanggung Pemerintah" },
  { key: "deferredAmount", label: "Ditunda" },
  { key: "notCollectedAmount", label: "Tidak Dipungut" },
  { key: "exemptedAmount", label: "Dibebaskan" },
  { key: "settledAmount", label: "Sudah Dilunasi" },
] as const
export type CustomsTaxDraft = {
  taxValue: string
  levyTypeCode: string
  rate: string
  amount: string
  status: string
} & Record<(typeof CUSTOMS_TAX_PAYMENT_FIELDS)[number]["key"], string>

// Transfer yang dipilih (Inventory Transfer Documents hmx, H-04). Selain id hanya untuk tampilan
// chip; yang disimpan hanya id-nya.
export type CustomsTransferChoice = {
  id: string
  number: string
  type: string
  movementCode: string
  status: string
}

export type CustomsDocumentDraft = {
  header: Record<CustomsHeaderColumn, string>
  transfers: CustomsTransferChoice[]
  details: Record<string, string>
  parties: CustomsPartyDraft[]
  lines: CustomsLineDraft[]
  attachments: CustomsAttachmentDraft[]
  packages: CustomsRowDraft[]
  containers: CustomsRowDraft[]
  transports: CustomsRowDraft[]
  taxes: CustomsTaxDraft[]
  guarantees: CustomsRowDraft[]
  bankAccounts: CustomsRowDraft[]
}

// Kunci baris per daftar, supaya baris baru dan data dari database punya bentuk yang sama.
export const CUSTOMS_ROW_KEYS = {
  packages: ["qty", "packageTypeCode", "marks"],
  containers: ["number", "sizeCode", "typeCode", "loadTypeCode"],
  transports: ["transportModeCode", "name", "voyageNumber", "flagCountryCode"],
  taxes: [
    "taxValue",
    "levyTypeCode",
    "rate",
    "amount",
    "status",
    ...CUSTOMS_TAX_PAYMENT_FIELDS.map((field) => field.key),
  ],
  guarantees: [
    "typeCode",
    "number",
    "date",
    "value",
    "dueDate",
    "guarantor",
    "bpjNumber",
    "bpjDate",
  ],
  bankAccounts: ["code", "bankCode"],
  vdEntries: ["valuationTypeCode", "dueDate", "amount"],
} as const

export const emptyRow = <Keys extends readonly string[]>(
  keys: Keys,
): Record<Keys[number], string> =>
  Object.fromEntries(keys.map((key) => [key, ""])) as Record<Keys[number], string>

export function emptyParty(entityTypeCode: string): CustomsPartyDraft {
  return {
    entityTypeCode,
    partnerId: null,
    name: "",
    address: "",
    countryCode: "",
    identityTypeCode: "",
    identityNumber: "",
    nib: "",
    permitNumber: "",
    permitDate: "",
    details: {},
  }
}

export function emptyAttachment(documentTypeCode = ""): CustomsAttachmentDraft {
  return {
    documentTypeCode,
    number: "",
    date: "",
    facilityCode: "",
    permit: "",
    officeCode: "",
    file: null,
  }
}

export function emptyLine(): CustomsLineDraft {
  return {
    ...(Object.fromEntries(CUSTOMS_LINE_COLUMNS.map((key) => [key, ""])) as Record<
      CustomsLineColumn,
      string
    >),
    productId: "",
    product: null,
    details: {},
    attachments: [],
    vdEntries: [],
    rawMaterials: [],
    entities: [],
    duties: [],
  }
}

// Jumlah per produk dari permintaan transfer yang dipilih (qty satuan stok, string numeric).
export type CustomsTransferProduct = {
  productId: string
  sku: string
  name: string
  hsCode: string
  qty: string
}

// Barang dari transfer yang dipilih (sync_inventory_transfer_product_lines hmx, H-04): barang
// produk yang sama diperbarui jumlahnya, produk baru ditambah, barang produk lain dibiarkan.
// Memilih transfer yang sama lagi tidak membuat baris ganda. Baris kosong (belum ada produk)
// dibuang supaya dokumen baru tidak tertinggal satu baris tanpa produk.
export function syncTransferLines(
  lines: CustomsLineDraft[],
  products: CustomsTransferProduct[],
): CustomsLineDraft[] {
  if (!products.length) return lines
  const qtyOf = new Map(products.map((product) => [product.productId, toDecimalInput(product.qty)]))
  const seen = new Set<string>()
  const kept = lines
    .filter((line) => line.productId)
    .map((line) => {
      const qty = qtyOf.get(line.productId)
      if (qty === undefined || seen.has(line.productId)) return line
      seen.add(line.productId)
      return { ...line, qty, stockQty: qty }
    })
  const added = products
    .filter((product) => !seen.has(product.productId))
    .map((product): CustomsLineDraft => {
      const qty = toDecimalInput(product.qty)
      return {
        ...emptyLine(),
        productId: product.productId,
        product: { id: product.productId, sku: product.sku, name: product.name },
        itemCode: product.sku,
        hsCode: product.hsCode,
        description: product.name,
        qty,
        stockQty: qty,
      }
    })
  return [...kept, ...added]
}

export function emptyDraft(): CustomsDocumentDraft {
  return {
    header: Object.fromEntries(CUSTOMS_HEADER_COLUMNS.map((key) => [key, ""])) as Record<
      CustomsHeaderColumn,
      string
    >,
    transfers: [],
    details: {},
    parties: [],
    lines: [emptyLine()],
    attachments: [emptyAttachment("380")],
    packages: [],
    containers: [],
    transports: [],
    taxes: [],
    guarantees: [],
    bankAccounts: [],
  }
}

// Nilai satu isian di data form (dokumen, entitas, sarana angkut pertama, atau baris barang).
export function customsFieldValue(
  draft: CustomsDocumentDraft,
  field: CustomsField,
  line?: CustomsLineDraft,
): string {
  switch (field.store) {
    case "details":
      return draft.details[field.key] ?? ""
    case "party":
    case "partyDetails": {
      const party = draft.parties.find((entry) => entry.entityTypeCode === field.role)
      if (!party) return ""
      return field.store === "party"
        ? ((party as unknown as Record<string, string>)[field.key] ?? "")
        : (party.details[field.key] ?? "")
    }
    case "transport":
      return draft.transports[0]?.[field.key] ?? ""
    case "line":
      return line ? ((line as unknown as Record<string, string>)[field.key] ?? "") : ""
    case "lineDetails":
      return line?.details[field.key] ?? ""
    default:
      return (draft.header as Record<string, string>)[field.key] ?? ""
  }
}

// Data form dengan satu isian diubah (dokumen, entitas, atau sarana angkut pertama).
export function setCustomsFieldValue(
  draft: CustomsDocumentDraft,
  field: CustomsField,
  value: string,
): CustomsDocumentDraft {
  switch (field.store) {
    case "details":
      return { ...draft, details: { ...draft.details, [field.key]: value } }
    case "party":
    case "partyDetails": {
      const role = field.role ?? ""
      const current =
        draft.parties.find((entry) => entry.entityTypeCode === role) ?? emptyParty(role)
      const next =
        field.store === "party"
          ? { ...current, [field.key]: value }
          : { ...current, details: { ...current.details, [field.key]: value } }
      const others = draft.parties.filter((entry) => entry !== current)
      return { ...draft, parties: [...others, next] }
    }
    case "transport": {
      const [first = emptyRow(CUSTOMS_ROW_KEYS.transports), ...rest] = draft.transports
      return { ...draft, transports: [{ ...first, [field.key]: value }, ...rest] }
    }
    default:
      return { ...draft, header: { ...draft.header, [field.key]: value } }
  }
}

// Lampiran: maksimal 5 MB (batas body server action 6 MB di next.config.ts), jenis yang umum
// untuk dokumen pendukung.
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

// Semua file lampiran satu dokumen ada di bawah awalan ini.
export function attachmentKeyPrefix(documentId: string) {
  return `customs/${documentId}/`
}

// ---------------------------------------------------------------------------------------------
// Validasi input di server. Kelengkapan (field wajib) TIDAK dicek di sini: Draft boleh belum
// lengkap; kelengkapan diperiksa aturan validasi database (M3-03) saat Submit.

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

// Nomor aju CEISA: 26 angka/huruf besar (constraint customs_documents_aju_number_format).
const ajuNumber = z
  .string()
  .transform((value) => value.replace(/\s/g, "").toUpperCase())
  .refine((value) => value === "" || /^[0-9A-Z]{26}$/.test(value), {
    message: "No. Aju harus 26 karakter angka atau huruf, seperti di portal CEISA.",
  })
  .transform((value) => value || null)

const HEADER_KINDS: Record<CustomsHeaderColumn, z.ZodType<string | null, string>> = {
  ajuNumber,
  ajuDate: date("Tgl. Aju"),
  registrationNumber: text("No. Daftar", 100),
  registrationDate: date("Tgl. Daftar"),
  customsOfficeCode: code,
  currencyCode: code,
  ndpbm: amount("NDPBM", 4),
  cifValue: amount("Nilai CIF", 2),
  fobValue: amount("Nilai FOB", 2),
  freightValue: amount("Freight", 2),
  insuranceValue: amount("Asuransi", 2),
  deliveryPrice: amount("Harga barang", 2),
  grossWeight: amount("Berat kotor", 4),
  netWeight: amount("Berat bersih", 4),
  signerName: text("Nama penandatangan", 100),
  signerPosition: text("Jabatan penandatangan", 100),
  signerCity: text("Tempat pernyataan", 100),
  signedDate: date("Tanggal pernyataan"),
  notes: text("Catatan", 2000),
}

function lineKinds(seq: number): Record<CustomsLineColumn, z.ZodType<string | null, string>> {
  const label = (name: string) => `Barang seri ${seq}: ${name}`
  return {
    itemCode: text(label("Kode barang"), 50),
    hsCode: code,
    description: text(label("Uraian"), 1000),
    brand: text(label("Merek"), 100),
    itemType: text(label("Tipe"), 100),
    itemSize: text(label("Ukuran"), 100),
    specification: text(label("Spesifikasi"), 1000),
    qty: amount(label("Jumlah"), 4),
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
    deliveryPrice: amount(label("Harga barang"), 2),
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

// Baris daftar sederhana yang disimpan sebagai jsonb (Voluntary Declaration): baris kosong dibuang.
const jsonRows = z
  .array(z.record(z.string(), z.string().max(200, "Isian maksimal 200 karakter.")))
  .transform((rows) =>
    rows
      .map((row) => Object.fromEntries(Object.entries(row).map(([key, v]) => [key, v.trim()])))
      .filter((row) => Object.values(row).some(Boolean)),
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
  details,
})

const attachmentSchema = z.object({
  documentTypeCode: z.string().trim().min(1, "Jenis lampiran wajib dipilih."),
  number: text("Nomor lampiran", 100),
  date: date("Tanggal lampiran"),
  facilityCode: code,
  permit: text("Izin lampiran", 100),
  officeCode: text("Kantor lampiran", 100),
  file: z
    .object({
      fileKey: z.string().min(1).max(300),
      fileName: z.string().trim().min(1).max(255),
      contentType: z.string().max(100),
      fileSize: z.number().int().positive(),
    })
    .nullable(),
})

const rawMaterialSchema = z.object({
  originCode: code,
  productSerial: text("Seri barang asal", 30),
  productCode: text("Kode barang bahan baku", 100),
  hsCode: code,
  description: text("Uraian bahan baku", 500),
  quantity: amount("Jumlah bahan baku", 4)
    .pipe(z.string().min(1, "Jumlah bahan baku wajib diisi."))
    .refine((value) => Number(value) > 0, "Jumlah bahan baku harus lebih dari nol."),
  unitCode: code,
  attachments: z.array(attachmentSchema).default([]),
  details,
})
const lineEntitySchema = z.object({
  entityTypeCode: z.string().trim().min(1, "Jenis entitas barang wajib dipilih."),
  partnerId: z.uuid().nullable(),
  name: z
    .string()
    .trim()
    .min(1, "Nama entitas barang wajib diisi.")
    .max(200, "Nama entitas barang maksimal 200 karakter."),
  address: text("Alamat entitas barang", 500),
  identityNumber: text("Nomor identitas entitas barang", 50),
  details,
})
const lineDutySchema = z
  .object({
    levyCode: z.enum(["bm", "ppn", "ppnbm", "pph", "cukai", "other"]),
    taxTypeCode: code,
    rateTypeCode: code,
    rate: amount("Tarif pungutan barang", 4).refine(
      (value) => value === null || Number(value) >= 0,
    ),
    exemptAmount: amount("Nilai dibebaskan", 2).refine(
      (value) => value === null || Number(value) >= 0,
    ),
    facilityCode: code,
    paidAmount: amount("Nilai sudah dilunasi", 2).refine(
      (value) => value === null || Number(value) >= 0,
    ),
    bmt: z.boolean().default(false),
    excise: z.boolean().default(false),
    details,
  })
  .superRefine((duty, ctx) => {
    const expectedCode: Partial<Record<typeof duty.levyCode, string>> = {
      bm: "BM",
      ppn: "PPN",
      ppnbm: "PPNBM",
      pph: "PPH",
      cukai: "CUKAI",
    }
    const expected = expectedCode[duty.levyCode]
    if (duty.taxTypeCode && expected && duty.taxTypeCode !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["taxTypeCode"],
        message: `Jenis pungutan harus ${expected} untuk kelompok ${duty.levyCode.toUpperCase()}.`,
      })
    }
  })

export const customsLineInputSchema = z
  .object({
    productId: z.uuid("Produk barang wajib dipilih."),
    // Hanya untuk tampilan pilihan produk di form.
    product: z.unknown(),
    details,
    attachments: z.array(attachmentSchema),
    vdEntries: jsonRows,
    rawMaterials: z.array(rawMaterialSchema).default([]),
    entities: z.array(lineEntitySchema).default([]),
    duties: z.array(lineDutySchema).default([]),
  })
  .catchall(z.string())
  .superRefine((line, ctx) => {
    const sourceLineId = line.details.sourceDocumentLineId
    if (sourceLineId && !z.uuid().safeParse(sourceLineId).success) {
      ctx.addIssue({
        code: "custom",
        path: ["details", "sourceDocumentLineId"],
        message: "Barang asal tidak valid.",
      })
    }
  })

export const customsDocumentInputSchema = z
  .object({
    header: z.record(z.string(), z.string()),
    // Hanya id yang disimpan; jenis dan status transfer diperiksa database (H-04).
    transfers: z
      .array(z.object({ id: z.uuid("Transfer tidak valid.") }))
      .default([])
      .transform((rows) => [...new Set(rows.map((row) => row.id))]),
    details,
    parties: z.array(partySchema),
    lines: z.array(customsLineInputSchema),
    attachments: z.array(attachmentSchema),
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
        voyageNumber: text("Nomor pengangkut", 50),
        flagCountryCode: code,
      }),
    ),
    taxes: z.array(
      z.object({
        taxValue: text("Nilai pungutan", 200).prefault(""),
        levyTypeCode: text("Jenis pungutan", 30),
        rate: amount("Tarif pungutan", 4),
        amount: amount("Nilai pungutan", 2),
        status: z.enum(["", "uncomputed", "computed", "paid"]).transform((value) => value || null),
        paidAmount: amount("Pungutan dibayar", 2).prefault(""),
        governmentBorneAmount: amount("Pungutan ditanggung pemerintah", 2).prefault(""),
        deferredAmount: amount("Pungutan ditunda", 2).prefault(""),
        notCollectedAmount: amount("Pungutan tidak dipungut", 2).prefault(""),
        exemptedAmount: amount("Pungutan dibebaskan", 2).prefault(""),
        settledAmount: amount("Pungutan sudah dilunasi", 2).prefault(""),
      }),
    ),
    guarantees: z.array(
      z.object({
        typeCode: code,
        number: text("Nomor jaminan", 100),
        date: date("Tanggal jaminan"),
        value: amount("Nilai jaminan", 2),
        dueDate: date("Tanggal jatuh tempo jaminan"),
        guarantor: text("Penjamin", 200),
        bpjNumber: text("Nomor BPJ", 100),
        bpjDate: date("Tanggal BPJ"),
      }),
    ),
    bankAccounts: z.array(z.object({ code: text("Kode bank devisa", 30), bankCode: code })),
  })
  .transform((input, ctx) => {
    const header = parseRecord(HEADER_KINDS, input.header, ctx)
    // parseRecord hanya membaca kolom baris, jadi product (tampilan) ikut terbuang.
    const lines = input.lines.map((line, index) => ({
      productId: line.productId,
      details: line.details,
      attachments: line.attachments,
      vdEntries: line.vdEntries,
      rawMaterials: line.rawMaterials,
      entities: line.entities,
      duties: line.duties,
      ...parseRecord(lineKinds(index + 1), line as unknown as Record<string, string>, ctx),
    }))
    // Entitas tanpa nama dibuang; peran yang boleh berulang (pemilik barang di daftar) diberi seri.
    const seqs = new Map<string, number>()
    const parties = input.parties
      .filter((party) => party.name)
      .map((party) => {
        const seq = (seqs.get(party.entityTypeCode) ?? 0) + 1
        seqs.set(party.entityTypeCode, seq)
        return { ...party, seq }
      })
    const packages = input.packages.filter((row) => row.qty !== null)
    const transports = input.transports.filter((row) => Object.values(row).some(Boolean))
    const levies = input.taxes.map((tax) => tax.levyTypeCode).filter(Boolean)
    if (new Set(levies).size !== levies.length) {
      ctx.addIssue({ code: "custom", message: "Jenis pungutan tidak boleh sama." })
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
      transferIds: input.transfers,
      details: input.details,
      parties,
      lines,
      attachments: input.attachments,
      packages,
      containers: input.containers.map((row, index) => ({ ...row, number: numbers[index] })),
      transports,
      taxes: input.taxes,
      guarantees: input.guarantees.filter((row) => Object.values(row).some(Boolean)),
      bankAccounts: input.bankAccounts.filter((row) => row.code || row.bankCode),
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

// Nilai isian untuk dibaca (tampilan baca, export PDF/Excel): kode referensi sebagai [kode] nama,
// angka format Indonesia, tanggal DD/MM/YYYY.
export function formatCustomsValue(
  field: CustomsFieldKind,
  value: string | undefined,
  refLabels: Record<string, string>,
) {
  if (!value) return "—"
  switch (field.kind) {
    case "ref": {
      const name = refLabels[`${field.refType}|${value}`]
      return name ? formatRefCode({ code: value, name }) : value
    }
    case "option":
      return `[${value}] ${customsOptionLabel(field.list, value)}`
    case "money":
    case "qty":
      return formatDecimal(value.replace(",", "."))
    case "date":
      return value.split("-").reverse().join("/")
    case "boolean":
      return value === "Y" ? "Ya" : "Tidak"
    default:
      return value
  }
}
