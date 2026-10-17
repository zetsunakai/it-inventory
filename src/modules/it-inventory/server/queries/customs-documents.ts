import "server-only"

import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm"

import { toDecimalInput } from "@/lib/decimal"
import type { ListParams } from "@/lib/list-params"
import type { RefCodeType } from "@/lib/ref-codes"
import { partnerAsCustomsParty } from "@/modules/inventory/lib/partner"
import type { CustomsDocCode, CustomsDocumentStatus } from "@/modules/it-inventory/lib/customs"
import {
  CUSTOMS_HEADER_COLUMNS,
  CUSTOMS_LINE_COLUMNS,
  emptyDraft,
  type CustomsDocumentDraft,
  type CustomsFormSpec,
  type CustomsLineDraft,
  type CustomsPartyDraft,
} from "@/modules/it-inventory/lib/customs-form"
import { companyAsCustomsParty } from "@/modules/it-inventory/lib/company"
import { db } from "@/server/db"
import {
  company,
  customsAttachments,
  customsContainers,
  customsDocumentLines,
  customsDocumentParties,
  customsDocuments,
  customsLineTaxes,
  customsPackages,
  customsTransports,
  partners,
  products,
  refCodes,
  uoms,
} from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"

// Data dokumen BC untuk form dan daftar per jenis (backlog M3-04, M3-05–M3-09).

const SEARCH_LIMIT = 20

export type CustomsProductChoice = {
  id: string
  sku: string
  name: string
  hsCode: string
  uomCode: string
}

// Produk aktif yang siap dokumen BC (punya kode HS, PRD 5.3) untuk baris barang.
export async function searchCustomsProducts(search: string): Promise<CustomsProductChoice[]> {
  const pattern = containsPattern(search)
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      hsCode: products.hsCode,
      uomCode: uoms.code,
    })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(
      and(
        eq(products.active, true),
        eq(products.customsReady, true),
        search ? or(ilike(products.sku, pattern), ilike(products.name, pattern)) : undefined,
      ),
    )
    .orderBy(asc(products.sku))
    .limit(SEARCH_LIMIT)
  return rows.map((row) => ({ ...row, hsCode: row.hsCode ?? "" }))
}

// Data partner sebagai entitas dokumen (disalin ke dokumen, bisa diubah di form).
export async function customsPartyFromPartner(partnerId: string) {
  const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId))
  if (!partner) return null
  const party = partnerAsCustomsParty(partner)
  return {
    partnerId: partner.id,
    name: party.name,
    address: party.address,
    countryCode: party.countryCode,
    identityTypeCode: party.identityType,
    identityNumber: party.identityNumber,
  }
}

// Dokumen baru: entitas perusahaan sesuai jenis (pengusaha, pemilik, eksportir) dari profil
// perusahaan, kantor pabean pengawas, dan penandatangan = user yang login (PRD 8.3).
export async function newCustomsDraft(spec: CustomsFormSpec, signerName: string) {
  const draft = emptyDraft(spec)
  const [profile] = await db.select().from(company)
  if (profile) {
    const party = companyAsCustomsParty(profile)
    draft.header.customsOfficeCode = profile.supervisingOfficeCode
    draft.parties = spec.parties
      .filter((role) => role.source === "company")
      .map((role): CustomsPartyDraft => ({
        entityTypeCode: role.code,
        partnerId: null,
        name: party.name,
        address: party.address,
        countryCode: "ID",
        identityTypeCode: party.identityType,
        identityNumber: party.identityNumber,
        nib: party.nib,
        permitNumber: party.permitNumber,
        permitDate: party.permitDate,
      }))
  }
  draft.header.signerName = signerName
  return { draft, refLabels: await refLabelsFor(spec, draft), companyReady: Boolean(profile) }
}

export type CustomsDocumentDetail = NonNullable<Awaited<ReturnType<typeof getCustomsDocument>>>

export async function getCustomsDocument(spec: CustomsFormSpec, id: string) {
  const [doc] = await db
    .select()
    .from(customsDocuments)
    .where(and(eq(customsDocuments.id, id), eq(customsDocuments.docCode, spec.code)))
  if (!doc) return null

  const [parties, lines, taxes, attachments, packages, containers, transports] = await Promise.all([
    db.select().from(customsDocumentParties).where(eq(customsDocumentParties.documentId, id)),
    db
      .select({ line: customsDocumentLines, sku: products.sku, productName: products.name })
      .from(customsDocumentLines)
      .innerJoin(products, eq(products.id, customsDocumentLines.productId))
      .where(eq(customsDocumentLines.documentId, id))
      .orderBy(asc(customsDocumentLines.seq)),
    db
      .select({ tax: customsLineTaxes })
      .from(customsLineTaxes)
      .innerJoin(customsDocumentLines, eq(customsDocumentLines.id, customsLineTaxes.lineId))
      .where(eq(customsDocumentLines.documentId, id))
      .orderBy(asc(customsLineTaxes.levyTypeCode)),
    db
      .select()
      .from(customsAttachments)
      .where(eq(customsAttachments.documentId, id))
      .orderBy(asc(customsAttachments.seq)),
    db
      .select()
      .from(customsPackages)
      .where(eq(customsPackages.documentId, id))
      .orderBy(asc(customsPackages.seq)),
    db
      .select()
      .from(customsContainers)
      .where(eq(customsContainers.documentId, id))
      .orderBy(asc(customsContainers.seq)),
    db
      .select()
      .from(customsTransports)
      .where(eq(customsTransports.documentId, id))
      .orderBy(asc(customsTransports.seq)),
  ])

  const order = new Map(spec.parties.map((role, index) => [role.code, index]))
  const draft: CustomsDocumentDraft = {
    header: Object.fromEntries(
      CUSTOMS_HEADER_COLUMNS.map((key) => [key, text(doc[key])]),
    ) as CustomsDocumentDraft["header"],
    details: stringRecord(doc.details),
    parties: parties
      .sort((a, b) => (order.get(a.entityTypeCode) ?? 99) - (order.get(b.entityTypeCode) ?? 99))
      .map((party) => ({
        entityTypeCode: party.entityTypeCode,
        partnerId: party.partnerId,
        name: party.name,
        address: text(party.address),
        countryCode: text(party.countryCode),
        identityTypeCode: text(party.identityTypeCode),
        identityNumber: text(party.identityNumber),
        nib: text(party.nib),
        permitNumber: text(party.permitNumber),
        permitDate: text(party.permitDate),
      })),
    lines: lines.map(({ line, sku, productName }): CustomsLineDraft => ({
      ...(Object.fromEntries(CUSTOMS_LINE_COLUMNS.map((key) => [key, text(line[key])])) as Record<
        (typeof CUSTOMS_LINE_COLUMNS)[number],
        string
      >),
      productId: line.productId,
      product: { id: line.productId, sku, name: productName },
      details: stringRecord(line.details),
      taxes: taxes
        .filter(({ tax }) => tax.lineId === line.id)
        .map(({ tax }) => ({
          levyTypeCode: tax.levyTypeCode,
          rate: text(tax.rate),
          facilityCode: text(tax.facilityCode),
          facilityRate: text(tax.facilityRate),
          amount: text(tax.amount),
        })),
    })),
    attachments: attachments.map((row) => ({
      documentTypeCode: row.documentTypeCode,
      number: text(row.number),
      date: text(row.date),
      file:
        row.fileKey && row.fileName
          ? {
              fileKey: row.fileKey,
              fileName: row.fileName,
              contentType: row.contentType ?? "",
              fileSize: row.fileSize ?? 0,
            }
          : null,
    })),
    packages: packages.map((row) => ({
      qty: text(row.qty),
      packageTypeCode: row.packageTypeCode,
      marks: text(row.marks),
    })),
    containers: containers.map((row) => ({
      number: row.number,
      sizeCode: text(row.sizeCode),
      typeCode: text(row.typeCode),
      loadTypeCode: text(row.loadTypeCode),
    })),
    transports: transports.map((row) => ({
      transportModeCode: text(row.transportModeCode),
      name: text(row.name),
      voyageNumber: text(row.voyageNumber),
      flagCountryCode: text(row.flagCountryCode),
    })),
  }

  return {
    id: doc.id,
    docCode: doc.docCode,
    status: doc.status,
    version: doc.version,
    ajuNumber: doc.ajuNumber,
    ajuDate: doc.ajuDate,
    registrationNumber: doc.registrationNumber,
    registrationDate: doc.registrationDate,
    responseCode: doc.responseCode,
    responseNumber: doc.responseNumber,
    responseDate: doc.responseDate,
    rejectionReason: doc.rejectionReason,
    submittedAt: doc.submittedAt,
    // Kekurangan menurut aturan validasi (M3-03), untuk Draft.
    missing:
      doc.status === "draft"
        ? (
            await db.execute<{ errors: string[] }>(
              sql`select customs_document_errors(${doc.id}) as errors`,
            )
          ).rows[0].errors
        : [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    draft,
    refLabels: await refLabelsFor(spec, draft),
  }
}

// Nama untuk kode referensi yang tersimpan, supaya pilihan tampil sebagai [kode] nama.
// Kunci: "<jenis>|<kode>".
export type RefLabels = Record<string, string>

async function refLabelsFor(spec: CustomsFormSpec, draft: CustomsDocumentDraft) {
  const pairs: [RefCodeType, string][] = []
  const add = (type: RefCodeType, code: string | undefined) => {
    if (code) pairs.push([type, code])
  }
  add("customs_office", draft.header.customsOfficeCode)
  add("currency", draft.header.currencyCode)
  for (const field of [...spec.header, ...spec.transaction, ...(spec.transport?.fields ?? [])]) {
    if (field.kind !== "ref") continue
    add(
      field.refType,
      field.detail ? draft.details[field.key] : (draft.header as Record<string, string>)[field.key],
    )
  }
  for (const party of draft.parties) add("country", party.countryCode)
  for (const line of draft.lines) {
    for (const field of spec.line) {
      if (field.kind === "ref") {
        add(
          field.refType,
          field.detail ? line.details[field.key] : (line as Record<string, string>)[field.key],
        )
      }
    }
    for (const tax of line.taxes) add("levy_type", tax.levyTypeCode)
  }
  for (const row of draft.attachments) add("document_type", row.documentTypeCode)
  for (const row of draft.packages) add("package_type", row.packageTypeCode)
  for (const row of draft.containers) {
    add("container_size", row.sizeCode)
    add("container_type", row.typeCode)
  }
  for (const row of draft.transports) {
    add("transport_mode", row.transportModeCode)
    add("country", row.flagCountryCode)
  }
  if (!pairs.length) return {}
  const conditions = pairs.map(
    ([type, code]) => sql`(${refCodes.type} = ${type} and ${refCodes.code} = ${code})`,
  )
  const rows = await db
    .select({ type: refCodes.type, code: refCodes.code, name: refCodes.name })
    .from(refCodes)
    .where(sql.join(conditions, sql` or `))
  return Object.fromEntries(rows.map((row) => [`${row.type}|${row.code}`, row.name])) as RefLabels
}

export type CustomsDocumentRow = {
  id: string
  ajuNumber: string
  ajuDate: string
  status: CustomsDocumentStatus
  registrationNumber: string | null
  registrationDate: string | null
  counterparty: string | null
  lineCount: number
}

// Entitas lawan transaksi yang ditampilkan di daftar: semua kecuali pengusaha TPB (3), pemilik (7),
// dan eksportir (2), yang selalu perusahaan sendiri.
const COUNTERPARTY = sql`(
  select p.name from customs_document_parties p
  where p.document_id = d.id and p.entity_type_code not in ('2', '3', '7')
  order by p.entity_type_code limit 1)`

export async function listCustomsDocuments({
  docCode,
  status,
  search,
  pageSize,
  offset,
}: ListParams & { docCode: CustomsDocCode; status?: CustomsDocumentStatus }) {
  const conditions: SQL[] = [sql`d.doc_code = ${docCode}`]
  if (status) conditions.push(sql`d.status = ${status}`)
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(
      sql`(d.aju_number ilike ${pattern} or d.registration_number ilike ${pattern}
        or ${COUNTERPARTY} ilike ${pattern})`,
    )
  }
  const where = sql.join(conditions, sql` and `)
  const [rows, totals] = await Promise.all([
    db.execute<{
      id: string
      aju_number: string
      aju_date: string
      status: CustomsDocumentStatus
      registration_number: string | null
      registration_date: string | null
      counterparty: string | null
      line_count: number
    }>(sql`
      select d.id, d.aju_number, d.aju_date::text, d.status, d.registration_number,
        d.registration_date::text, ${COUNTERPARTY} as counterparty,
        (select count(*)::int from customs_document_lines l where l.document_id = d.id)
          as line_count
      from customs_documents d
      where ${where}
      order by case when d.status in ('registered', 'cancelled') then 1 else 0 end,
        d.created_at desc
      limit ${pageSize} offset ${offset}`),
    db.execute<{ total: number }>(
      sql`select count(*)::int as total from customs_documents d where ${where}`,
    ),
  ])
  return {
    rows: rows.rows.map((row): CustomsDocumentRow => ({
      id: row.id,
      ajuNumber: row.aju_number,
      ajuDate: row.aju_date,
      status: row.status,
      registrationNumber: row.registration_number,
      registrationDate: row.registration_date,
      counterparty: row.counterparty,
      lineCount: row.line_count,
    })),
    total: totals.rows[0]?.total ?? 0,
  }
}

// Nilai tersimpan sebagai isi field form. Angka numeric Postgres ("1000.50") ditulis seperti input
// user ("1000,5").
function text(value: string | null | undefined) {
  if (!value) return ""
  return /^\d+\.\d+$/.test(value) ? toDecimalInput(value) : value
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object") return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry)]),
  )
}
