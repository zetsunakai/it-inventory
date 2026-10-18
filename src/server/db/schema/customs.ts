import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

// Path relatif (bukan alias @/) karena schema juga dibaca oleh drizzle-kit dan script CLI.
import {
  CUSTOMS_DOC_CODES,
  CUSTOMS_DOCUMENT_STATUSES,
  CUSTOMS_RULE_TARGETS,
} from "../../../modules/it-inventory/lib/customs"

import { timestamps } from "./_columns"
import { partners } from "./partners"
import { products } from "./products"
import { inventoryCategory } from "./warehouses"

// Dokumen kepabeanan (PRD bagian 7 dan 13, backlog M3-01). Satu set tabel untuk semua jenis
// dokumen, dibedakan doc_code; field yang hanya dipakai sebagian jenis (pelabuhan, BC 1.1, DPP,
// uang muka, dst.) disimpan di kolom details (jsonb), jadi jenis baru tidak butuh tabel baru.
// Kolom *_code berisi kode ref_codes (jenisnya di komentar); kodenya dicek server, seperti
// master data lain. Aturan lain di migrasi customs_documents_rules.

const id = () =>
  uuid()
    .default(sql`gen_random_uuid()`)
    .primaryKey()

// Qty numeric(18,4), nilai uang numeric(18,2) (PRD bagian 13.1).
const qty = () => numeric({ precision: 18, scale: 4 })
const money = () => numeric({ precision: 18, scale: 2 })

// Field khusus jenis dokumen: selalu objek JSON.
const details = () => jsonb().notNull().default({})

// Nomor seri baris di dalam dokumen (seri CEISA), mulai dari 1.
const seq = () => integer().notNull()

export const customsDocCode = pgEnum("customs_doc_code", CUSTOMS_DOC_CODES)
export const customsDocumentStatus = pgEnum("customs_document_status", CUSTOMS_DOCUMENT_STATUSES)
export const customsRuleTarget = pgEnum("customs_rule_target", CUSTOMS_RULE_TARGETS)

// Header dokumen. Nomor aju dibuat database saat dokumen dibuat (M3-02) dan tidak berubah
// walaupun direvisi; version naik setiap revisi (M3-12).
export const customsDocuments = pgTable(
  "customs_documents",
  {
    id: id(),
    docCode: customsDocCode().notNull(),
    status: customsDocumentStatus().notNull().default("draft"),
    version: integer().notNull().default(1),
    // Diisi trigger saat insert lewat next_aju_number() (M3-02); default null hanya supaya insert
    // tidak wajib mengisinya.
    ajuNumber: text()
      .notNull()
      .default(sql`null`),
    ajuDate: date({ mode: "string" })
      .notNull()
      .default(sql`null`),
    // Kode ref_codes jenis customs_office: kantor pabean tempat dokumen diajukan.
    customsOfficeCode: text(),
    registrationNumber: text(),
    registrationDate: date({ mode: "string" }),
    // Kode ref_codes jenis response, nomor dan tanggal surat respon Bea Cukai.
    responseCode: text(),
    responseNumber: text(),
    responseDate: date({ mode: "string" }),
    // Kode ref_codes jenis currency dan kursnya (NDPBM) terhadap rupiah.
    currencyCode: text(),
    ndpbm: qty(),
    cifValue: money(),
    fobValue: money(),
    freightValue: money(),
    insuranceValue: money(),
    // Harga penyerahan (BC 4.0, 4.1, 2.5).
    deliveryPrice: money(),
    // Kilogram.
    grossWeight: qty(),
    netWeight: qty(),
    signerName: text(),
    signerPosition: text(),
    signerCity: text(),
    signedDate: date({ mode: "string" }),
    details: details(),
    notes: text(),
    // Alur status (M3-11): kapan diajukan, alasan penolakan Bea Cukai.
    submittedAt: timestamp({ withTimezone: true }),
    rejectionReason: text(),
    cancelledAt: timestamp({ withTimezone: true }),
    // Diisi trigger dari app.user_id, tanpa foreign key seperti transfers.
    createdBy: uuid(),
    ...timestamps,
  },
  (table) => [
    unique("customs_documents_aju_number_unique").on(table.ajuNumber),
    index("customs_documents_doc_code_status_idx").on(table.docCode, table.status),
    index("customs_documents_registration_idx").on(table.docCode, table.registrationNumber),
    index("customs_documents_aju_date_idx").on(table.ajuDate),
    check("customs_documents_version_positive", sql`${table.version} >= 1`),
    check("customs_documents_details_object", sql`jsonb_typeof(${table.details}) = 'object'`),
    check(
      "customs_documents_registered_has_number",
      sql`${table.status} <> 'registered' or (${table.registrationNumber} is not null and ${table.registrationDate} is not null)`,
    ),
    check(
      "customs_documents_cancelled_has_date",
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} is not null)`,
    ),
    check("customs_documents_ndpbm_positive", sql`${table.ndpbm} > 0`),
    check(
      "customs_documents_values_not_negative",
      sql`${table.cifValue} >= 0 and ${table.fobValue} >= 0 and ${table.freightValue} >= 0
        and ${table.insuranceValue} >= 0 and ${table.deliveryPrice} >= 0
        and ${table.grossWeight} >= 0 and ${table.netWeight} >= 0`,
    ),
  ],
)

// Entitas per peran (PRD 7.2): pengusaha TPB, pemilik, pemasok, pembeli, penerima, PPJK, dst.
// Peran memakai kode entitas CEISA (ref_codes jenis entity_type), satu baris per peran. Data
// disalin dari profil perusahaan atau partner (companyAsCustomsParty, partnerAsCustomsParty)
// supaya dokumen tidak berubah saat master berubah; partner_id hanya penanda asalnya.
export const customsDocumentParties = pgTable(
  "customs_document_parties",
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => customsDocuments.id, { onDelete: "cascade" }),
    entityTypeCode: text().notNull(),
    partnerId: uuid().references(() => partners.id, { onDelete: "restrict" }),
    name: text().notNull(),
    address: text(),
    // Kode ref_codes jenis country.
    countryCode: text(),
    // Kode jenis identitas CEISA (mis. 6 = NPWP 16 digit) dan nomornya (NITKU untuk NPWP).
    identityTypeCode: text(),
    identityNumber: text(),
    nib: text(),
    permitNumber: text(),
    permitDate: date({ mode: "string" }),
    details: details(),
    ...timestamps,
  },
  (table) => [
    unique("customs_document_parties_role_unique").on(table.documentId, table.entityTypeCode),
    index("customs_document_parties_partner_idx").on(table.partnerId),
    check("customs_document_parties_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check(
      "customs_document_parties_details_object",
      sql`jsonb_typeof(${table.details}) = 'object'`,
    ),
  ],
)

// Barang (PRD 7.2). qty dalam satuan CEISA (ceisa_unit_code); stock_qty adalah qty yang sama
// dalam satuan stok produk, dipakai mencocokkan dokumen dengan transfer (PRD 8.4). Kode HS,
// uraian, dan kategori disalin dari produk saat baris dibuat.
export const customsDocumentLines = pgTable(
  "customs_document_lines",
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => customsDocuments.id, { onDelete: "cascade" }),
    seq: seq(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    // Product code saat baris dibuat (kodeBarang CEISA).
    itemCode: text(),
    // Kode ref_codes jenis hs_code.
    hsCode: text(),
    description: text(),
    brand: text(),
    itemType: text(),
    itemSize: text(),
    specification: text(),
    // Kategori IT Inventory produk (PRD 9.2), diisi trigger; default null hanya supaya insert
    // tidak wajib mengisinya.
    category: inventoryCategory()
      .notNull()
      .default(sql`null`),
    qty: qty(),
    // Kode ref_codes jenis ceisa_unit.
    ceisaUnitCode: text(),
    stockQty: qty(),
    packageQty: qty(),
    // Kode ref_codes jenis package_type.
    packageTypeCode: text(),
    // Kilogram.
    netWeight: qty(),
    // Kode ref_codes jenis country.
    originCountryCode: text(),
    unitPrice: qty(),
    invoiceValue: money(),
    cifValue: money(),
    fobValue: money(),
    freightValue: money(),
    insuranceValue: money(),
    deliveryPrice: money(),
    // Nilai pabean dalam rupiah.
    customsValue: money(),
    details: details(),
    ...timestamps,
  },
  (table) => [
    unique("customs_document_lines_seq_unique").on(table.documentId, table.seq),
    index("customs_document_lines_product_idx").on(table.productId),
    check("customs_document_lines_seq_positive", sql`${table.seq} >= 1`),
    check("customs_document_lines_qty_positive", sql`${table.qty} > 0 and ${table.stockQty} > 0`),
    check(
      "customs_document_lines_values_not_negative",
      sql`${table.packageQty} >= 0 and ${table.netWeight} >= 0 and ${table.unitPrice} >= 0
        and ${table.invoiceValue} >= 0 and ${table.cifValue} >= 0 and ${table.fobValue} >= 0
        and ${table.freightValue} >= 0 and ${table.insuranceValue} >= 0
        and ${table.deliveryPrice} >= 0 and ${table.customsValue} >= 0`,
    ),
    check("customs_document_lines_details_object", sql`jsonb_typeof(${table.details}) = 'object'`),
  ],
)

// Pungutan per barang (PRD 7.2): BM, PPN, PPh, PPnBM, satu baris per jenis. facility_code adalah
// kode fasilitas tarif CEISA (mis. ditangguhkan, dibebaskan); rate dalam persen.
export const customsLineTaxes = pgTable(
  "customs_line_taxes",
  {
    id: id(),
    lineId: uuid()
      .notNull()
      .references(() => customsDocumentLines.id, { onDelete: "cascade" }),
    // Kode ref_codes jenis levy_type.
    levyTypeCode: text().notNull(),
    rate: qty(),
    facilityCode: text(),
    facilityRate: qty(),
    amount: money(),
    ...timestamps,
  },
  (table) => [
    unique("customs_line_taxes_levy_unique").on(table.lineId, table.levyTypeCode),
    check(
      "customs_line_taxes_not_negative",
      sql`${table.rate} >= 0 and ${table.facilityRate} >= 0 and ${table.amount} >= 0`,
    ),
  ],
)

// Lampiran (PRD 7.2): invoice, packing list, B/L atau AWB, kontrak, izin. Jenisnya kode ref_codes
// jenis document_type (380 invoice, 217 packing list, 705 B/L, 740 AWB, 315 kontrak). File
// disimpan lewat modul storage (M3-10); di sini hanya kuncinya.
export const customsAttachments = pgTable(
  "customs_attachments",
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => customsDocuments.id, { onDelete: "cascade" }),
    seq: seq(),
    documentTypeCode: text().notNull(),
    number: text(),
    date: date({ mode: "string" }),
    fileKey: text(),
    fileName: text(),
    contentType: text(),
    fileSize: integer(),
    ...timestamps,
  },
  (table) => [
    unique("customs_attachments_seq_unique").on(table.documentId, table.seq),
    index("customs_attachments_type_idx").on(table.documentId, table.documentTypeCode),
    // Unduh lampiran lewat kunci file (/api/customs-files).
    index("customs_attachments_file_key_idx").on(table.fileKey),
    check("customs_attachments_seq_positive", sql`${table.seq} >= 1`),
    check(
      "customs_attachments_file_complete",
      sql`(${table.fileKey} is null) = (${table.fileName} is null)`,
    ),
    check("customs_attachments_file_size_positive", sql`${table.fileSize} > 0`),
  ],
)

// Kemasan (PRD 7.2).
export const customsPackages = pgTable(
  "customs_packages",
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => customsDocuments.id, { onDelete: "cascade" }),
    seq: seq(),
    qty: qty().notNull(),
    // Kode ref_codes jenis package_type.
    packageTypeCode: text().notNull(),
    marks: text(),
    ...timestamps,
  },
  (table) => [
    unique("customs_packages_seq_unique").on(table.documentId, table.seq),
    check("customs_packages_seq_positive", sql`${table.seq} >= 1`),
    check("customs_packages_qty_positive", sql`${table.qty} > 0`),
  ],
)

// Peti kemas (PRD 7.2). load_type_code = jenis muatan CEISA (FCL/LCL).
export const customsContainers = pgTable(
  "customs_containers",
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => customsDocuments.id, { onDelete: "cascade" }),
    seq: seq(),
    number: text().notNull(),
    // Kode ref_codes jenis container_size dan container_type.
    sizeCode: text(),
    typeCode: text(),
    loadTypeCode: text(),
    ...timestamps,
  },
  (table) => [
    unique("customs_containers_seq_unique").on(table.documentId, table.seq),
    unique("customs_containers_number_unique").on(table.documentId, table.number),
    check("customs_containers_seq_positive", sql`${table.seq} >= 1`),
    check("customs_containers_number_not_blank", sql`btrim(${table.number}) <> ''`),
  ],
)

// Sarana angkut (PRD 7.2). Pelabuhan, TPS, dan data BC 1.1 ada di header (details) karena
// berlaku untuk seluruh dokumen, seperti di payload CEISA.
export const customsTransports = pgTable(
  "customs_transports",
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => customsDocuments.id, { onDelete: "cascade" }),
    seq: seq(),
    // Kode ref_codes jenis transport_mode.
    transportModeCode: text(),
    name: text(),
    voyageNumber: text(),
    // Kode ref_codes jenis country.
    flagCountryCode: text(),
    ...timestamps,
  },
  (table) => [
    unique("customs_transports_seq_unique").on(table.documentId, table.seq),
    check("customs_transports_seq_positive", sql`${table.seq} >= 1`),
  ],
)

// Field wajib per jenis dokumen (PRD 7.2, backlog M3-03), disimpan sebagai data supaya jenis baru
// cukup menambah baris. Diperiksa customs_document_errors(), yang melaporkan semua kekurangan
// sekaligus. label dipakai di pesan, position menentukan urutannya.
export const docValidationRules = pgTable(
  "doc_validation_rules",
  {
    id: id(),
    docCode: customsDocCode().notNull(),
    target: customsRuleTarget().notNull(),
    field: text().notNull(),
    label: text().notNull(),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("doc_validation_rules_field_unique").on(table.docCode, table.target, table.field),
    check("doc_validation_rules_label_not_blank", sql`btrim(${table.label}) <> ''`),
  ],
)

// Revisi dokumen Terdaftar (PRD 7.5, backlog M3-12): snapshot jsonb versi lama (dokumen beserta
// semua bagiannya, dari customs_document_snapshot()) dan alasan revisinya. Append-only; dokumen
// lanjut ke versi berikutnya dengan nomor aju yang sama.
export const customsDocumentRevisions = pgTable(
  "customs_document_revisions",
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => customsDocuments.id, { onDelete: "cascade" }),
    // Versi yang disimpan snapshot ini.
    version: integer().notNull(),
    snapshot: jsonb().notNull(),
    reason: text().notNull(),
    // Diisi fungsi dari app.user_id, tanpa foreign key seperti audit_logs.
    createdBy: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("customs_document_revisions_version_unique").on(table.documentId, table.version),
    check("customs_document_revisions_reason_not_blank", sql`btrim(${table.reason}) <> ''`),
  ],
)

// Alokasi dokumen asal (PRD 8.5, backlog M4-03): qty (satuan stok) baris barang dokumen keluar yang
// diambil dari baris barang dokumen masuk (saldo asal). Pasangan jenis, produk, dan sisa saldo
// asal diperiksa trigger origin_allocations_before_write; dikunci bersama dokumen keluarnya.
export const originAllocations = pgTable(
  "origin_allocations",
  {
    id: id(),
    outLineId: uuid()
      .notNull()
      .references(() => customsDocumentLines.id, { onDelete: "cascade" }),
    originLineId: uuid()
      .notNull()
      .references(() => customsDocumentLines.id, { onDelete: "restrict" }),
    qty: qty().notNull(),
    createdBy: uuid(),
    ...timestamps,
  },
  (table) => [
    unique("origin_allocations_pair_unique").on(table.outLineId, table.originLineId),
    index("origin_allocations_origin_idx").on(table.originLineId),
    check("origin_allocations_qty_positive", sql`${table.qty} > 0`),
  ],
)
