import "server-only"

import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm"

import { toDecimalInput } from "@/lib/decimal"
import type { ListParams } from "@/lib/list-params"
import type { RefCodeType } from "@/lib/ref-codes"
import { partnerAsCustomsParty } from "@/modules/inventory/lib/partner"
import type {
  CustomsDocCode,
  CustomsDocumentStatus,
  CustomsPeriod,
} from "@/modules/it-inventory/lib/customs"
import {
  CUSTOMS_HEADER_COLUMNS,
  CUSTOMS_LINE_COLUMNS,
  CUSTOMS_ROW_KEYS,
  customsDocumentFields,
  customsDraftChanges,
  customsFieldValue,
  customsLineFields,
  emptyDraft,
  isListBlock,
  isFieldGroup,
  type CustomsField,
  type CustomsBlock,
  type CustomsAttachmentDraft,
  type CustomsDocumentDraft,
  type CustomsFormSpec,
  type CustomsLineDraft,
  type CustomsPartyDraft,
} from "@/modules/it-inventory/lib/customs-form"
import { companyAsCustomsParty } from "@/modules/it-inventory/lib/company"
import { db } from "@/server/db"
import {
  company,
  docValidationRules,
  customsAttachments,
  customsBankAccounts,
  customsContainers,
  customsDocumentLines,
  customsDocumentParties,
  customsDocumentRevisions,
  customsDocumentTaxes,
  customsDocuments,
  customsGuarantees,
  customsPackages,
  customsTransports,
  partners,
  products,
  refCodes,
  uoms,
  users,
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

// Data partner sebagai entitas dokumen (disalin ke dokumen, bisa diubah di form). Nomor identitas
// dan NITKU diisi terpisah seperti form entitas hmx.
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
    identityNumber: partner.identityNumber,
    details: (partner.nitku ? { nitku: partner.nitku } : {}) as Record<string, string>,
  }
}

// Dokumen baru: entitas perusahaan sesuai jenis (pengusaha, pemilik, eksportir, importir) dari
// profil perusahaan, kantor pabean pengawas, dan penandatangan = user yang login (PRD 8.3).
export async function newCustomsDraft(spec: CustomsFormSpec, signerName: string) {
  const draft = emptyDraft()
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
        identityNumber: party.npwp,
        nib: party.nib,
        permitNumber: party.permitNumber,
        permitDate: party.permitDate,
        details: { nitku: party.nitku },
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

  const bySeq = <T extends { seq: number }>(rows: T[]) => rows.sort((a, b) => a.seq - b.seq)
  const [
    parties,
    lines,
    attachments,
    packages,
    containers,
    transports,
    taxes,
    guarantees,
    bankAccounts,
  ] = await Promise.all([
    db.select().from(customsDocumentParties).where(eq(customsDocumentParties.documentId, id)),
    db
      .select({ line: customsDocumentLines, sku: products.sku, productName: products.name })
      .from(customsDocumentLines)
      .innerJoin(products, eq(products.id, customsDocumentLines.productId))
      .where(eq(customsDocumentLines.documentId, id))
      .orderBy(asc(customsDocumentLines.seq)),
    db.select().from(customsAttachments).where(eq(customsAttachments.documentId, id)),
    db.select().from(customsPackages).where(eq(customsPackages.documentId, id)),
    db.select().from(customsContainers).where(eq(customsContainers.documentId, id)),
    db.select().from(customsTransports).where(eq(customsTransports.documentId, id)),
    db.select().from(customsDocumentTaxes).where(eq(customsDocumentTaxes.documentId, id)),
    db.select().from(customsGuarantees).where(eq(customsGuarantees.documentId, id)),
    db.select().from(customsBankAccounts).where(eq(customsBankAccounts.documentId, id)),
  ])

  const draft = buildDraft(spec, {
    document: doc,
    parties: bySeq(parties),
    lines: lines.map(({ line, sku, productName }) => ({ ...line, sku, productName })),
    attachments: bySeq(attachments),
    packages: bySeq(packages),
    containers: bySeq(containers),
    transports: bySeq(transports),
    taxes: bySeq(taxes),
    guarantees: bySeq(guarantees),
    bankAccounts: bySeq(bankAccounts),
  })

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

// Baris tabel dokumen (dari drizzle, atau snapshot revisi yang sudah diubah ke camelCase).
// Nilai numeric bisa berupa string (drizzle) atau angka (jsonb snapshot).
type Value = string | number | null | undefined
type Row = Record<string, unknown>
export type DocumentRows = {
  document: Row
  parties: Row[]
  lines: (Row & { sku: string; productName: string })[]
  attachments: Row[]
  packages: Row[]
  containers: Row[]
  transports: Row[]
  taxes: Row[]
  guarantees: Row[]
  bankAccounts: Row[]
}

const pick = <K extends string>(row: Row, keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, text(row[key] as Value)])) as Record<K, string>

function attachmentDraft(row: Row): CustomsAttachmentDraft {
  return {
    ...pick(row, ["documentTypeCode", "number", "date", "facilityCode", "permit", "officeCode"]),
    file:
      row.fileKey && row.fileName
        ? {
            fileKey: row.fileKey as string,
            fileName: row.fileName as string,
            contentType: (row.contentType as string | null) ?? "",
            fileSize: Number(row.fileSize ?? 0),
          }
        : null,
  }
}

// Data form dari baris tabel dokumen; dipakai untuk dokumen sekarang dan snapshot revisi (M3-12).
export function buildDraft(spec: CustomsFormSpec, rows: DocumentRows): CustomsDocumentDraft {
  const order = new Map(spec.parties.map((role, index) => [role.code, index]))
  const lineAttachments = (lineId: unknown) =>
    rows.attachments.filter((row) => row.lineId === lineId).map(attachmentDraft)
  return {
    header: pick(rows.document, CUSTOMS_HEADER_COLUMNS),
    details: stringRecord(rows.document.details),
    parties: [...rows.parties]
      .sort(
        (a, b) =>
          (order.get(a.entityTypeCode as string) ?? 99) -
          (order.get(b.entityTypeCode as string) ?? 99),
      )
      .map((party) => ({
        ...pick(party, [
          "entityTypeCode",
          "name",
          "address",
          "countryCode",
          "identityTypeCode",
          "identityNumber",
          "nib",
          "permitNumber",
          "permitDate",
        ] as const),
        partnerId: (party.partnerId as string | null) ?? null,
        details: stringRecord(party.details),
      })),
    lines: rows.lines.map((line): CustomsLineDraft => ({
      ...pick(line, CUSTOMS_LINE_COLUMNS),
      productId: line.productId as string,
      product: { id: line.productId as string, sku: line.sku, name: line.productName },
      details: stringRecord(line.details),
      attachments: lineAttachments(line.id),
      vdEntries: Array.isArray(line.vdEntries)
        ? (line.vdEntries as Row[]).map((row) => pick(row, CUSTOMS_ROW_KEYS.vdEntries))
        : [],
    })),
    attachments: lineAttachments(null),
    packages: rows.packages.map((row) => pick(row, CUSTOMS_ROW_KEYS.packages)),
    containers: rows.containers.map((row) => pick(row, CUSTOMS_ROW_KEYS.containers)),
    transports: rows.transports.map((row) => pick(row, CUSTOMS_ROW_KEYS.transports)),
    taxes: rows.taxes.map((row) => pick(row, CUSTOMS_ROW_KEYS.taxes)),
    guarantees: rows.guarantees.map((row) => pick(row, CUSTOMS_ROW_KEYS.guarantees)),
    bankAccounts: rows.bankAccounts.map((row) => pick(row, CUSTOMS_ROW_KEYS.bankAccounts)),
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
  for (const field of customsDocumentFields(spec)) {
    if (field.kind === "ref") add(field.refType, customsFieldValue(draft, field))
  }
  // Kolom daftar: nilai dibaca dari baris daftar (pemilik barang dari entitas berseri).
  for (const tab of spec.tabs) {
    for (const block of tab.blocks) {
      if (!isListBlock(block) || block.list === "lines") continue
      const rows: Record<string, unknown>[] =
        block.list === "owners"
          ? draft.parties
          : block.list === "attachments"
            ? draft.attachments
            : block.list === "vdEntries"
              ? []
              : draft[block.list]
      for (const column of block.columns) {
        if (column.kind !== "ref") continue
        for (const row of rows) add(column.refType, row[column.key] as string | undefined)
      }
    }
  }
  const lartas = spec.line.lartas?.columns ?? []
  for (const line of draft.lines) {
    for (const field of customsLineFields(spec)) {
      if (field.kind === "ref") add(field.refType, customsFieldValue(draft, field, line))
    }
    for (const column of lartas) {
      if (column.kind !== "ref") continue
      for (const row of line.attachments) {
        add(column.refType, (row as unknown as Record<string, string>)[column.key])
      }
    }
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

const TODAY = sql`(now() at time zone 'Asia/Jakarta')::date`

// Kantor pabean yang dipakai dokumen satu jenis, untuk pilihan filter daftar.
export async function customsOfficeOptions(docCode: CustomsDocCode) {
  const rows = await db.execute<{ code: string; name: string | null }>(sql`
    select distinct d.customs_office_code as code, r.name
    from customs_documents d
    left join ref_codes r on r.type = 'customs_office' and r.code = d.customs_office_code
      and r.parent_code is null
    where d.doc_code = ${docCode} and d.customs_office_code is not null
    order by 1`)
  return rows.rows.map((row) => ({
    value: row.code,
    label: row.name ? `[${row.code}] ${row.name}` : row.code,
  }))
}

// Entitas lawan transaksi yang ditampilkan di daftar: semua kecuali pengusaha TPB (3), pemilik (7),
// dan eksportir (2), yang selalu perusahaan sendiri. Entitas dari master partner didahulukan, jadi
// importir dan pemusatan BC 2.0 (perusahaan sendiri) tidak tampil sebagai lawan transaksi.
const COUNTERPARTY = sql`(
  select p.name from customs_document_parties p
  where p.document_id = d.id and p.entity_type_code not in ('2', '3', '7')
  order by p.partner_id is null, p.entity_type_code limit 1)`

// Rentang tanggal aju per pilihan periode, dalam tanggal WIB.
const PERIOD_RANGES: Record<CustomsPeriod, SQL> = {
  "bulan-ini": sql`date_trunc('month', ${TODAY}) and ${TODAY}`,
  "bulan-lalu": sql`date_trunc('month', ${TODAY}) - interval '1 month'
    and date_trunc('month', ${TODAY}) - interval '1 day'`,
  "3-bulan": sql`${TODAY} - interval '3 months' and ${TODAY}`,
  "tahun-ini": sql`date_trunc('year', ${TODAY}) and ${TODAY}`,
}

export async function listCustomsDocuments({
  docCode,
  status,
  officeCode,
  period,
  search,
  pageSize,
  offset,
}: ListParams & {
  docCode: CustomsDocCode
  status?: CustomsDocumentStatus
  officeCode?: string
  period?: CustomsPeriod
}) {
  const conditions: SQL[] = [sql`d.doc_code = ${docCode}`]
  if (status) conditions.push(sql`d.status = ${status}`)
  if (officeCode) conditions.push(sql`d.customs_office_code = ${officeCode}`)
  if (period) conditions.push(sql`d.aju_date between ${PERIOD_RANGES[period]}`)
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
function text(value: Value) {
  if (value === null || value === undefined || value === "") return ""
  const textValue = String(value)
  return /^\d+\.\d+$/.test(textValue) ? toDecimalInput(textValue) : textValue
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object") return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry)]),
  )
}

// Snapshot revisi (jsonb, kolom snake_case) sebagai DocumentRows.
function snapshotRows(snapshot: unknown): DocumentRows {
  const camel = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(camel)
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()),
          // details sudah camelCase dan isinya bukan kolom.
          key === "details" ? entry : camel(entry),
        ]),
      )
    }
    return value
  }
  // Snapshot sebelum migrasi customs_forms_hmx belum punya pungutan dokumen, jaminan, dan bank
  // devisa.
  return {
    taxes: [],
    guarantees: [],
    bankAccounts: [],
    ...(camel(snapshot) as Partial<DocumentRows>),
  } as DocumentRows
}

export type CustomsRevisionEntry = {
  version: number
  reason: string
  createdAt: Date
  userName: string | null
  // Bagian/isian yang berubah di versi berikutnya.
  changes: string[]
}

// Riwayat revisi: siapa, kapan, alasan, dan apa yang berubah dibanding versi sesudahnya (versi
// terakhir dibandingkan dengan dokumen sekarang).
export async function listCustomsRevisions(
  spec: CustomsFormSpec,
  documentId: string,
  current: CustomsDocumentDraft,
): Promise<CustomsRevisionEntry[]> {
  const rows = await db
    .select({
      version: customsDocumentRevisions.version,
      reason: customsDocumentRevisions.reason,
      createdAt: customsDocumentRevisions.createdAt,
      snapshot: customsDocumentRevisions.snapshot,
      userName: users.name,
    })
    .from(customsDocumentRevisions)
    .leftJoin(users, eq(users.id, customsDocumentRevisions.createdBy))
    .where(eq(customsDocumentRevisions.documentId, documentId))
    .orderBy(asc(customsDocumentRevisions.version))
  const drafts = rows.map((row) => buildDraft(spec, snapshotRows(row.snapshot)))
  return rows.map((row, index) => ({
    version: row.version,
    reason: row.reason,
    createdAt: row.createdAt,
    userName: row.userName,
    changes: customsDraftChanges(spec, drafts[index], drafts[index + 1] ?? current),
  }))
}

// Satu versi lama (read-only) untuk ditampilkan.
export async function getCustomsRevision(
  spec: CustomsFormSpec,
  documentId: string,
  version: number,
) {
  const [row] = await db
    .select({
      snapshot: customsDocumentRevisions.snapshot,
      reason: customsDocumentRevisions.reason,
      createdAt: customsDocumentRevisions.createdAt,
    })
    .from(customsDocumentRevisions)
    .innerJoin(customsDocuments, eq(customsDocuments.id, customsDocumentRevisions.documentId))
    .where(
      and(
        eq(customsDocumentRevisions.documentId, documentId),
        eq(customsDocumentRevisions.version, version),
        eq(customsDocuments.docCode, spec.code),
      ),
    )
  if (!row) return null
  const rows = snapshotRows(row.snapshot)
  const draft = buildDraft(spec, rows)
  return {
    version,
    reason: row.reason,
    createdAt: row.createdAt,
    ajuNumber: String(rows.document.ajuNumber),
    registrationNumber: (rows.document.registrationNumber as string | null) ?? null,
    registrationDate: (rows.document.registrationDate as string | null) ?? null,
    draft,
    refLabels: await refLabelsFor(spec, draft),
  }
}

// Penanda wajib mengikuti aturan kelengkapan aktif per jenis dokumen.
export async function requiredCustomsSpec(spec: CustomsFormSpec): Promise<CustomsFormSpec> {
  const rules = await db
    .select()
    .from(docValidationRules)
    .where(and(eq(docValidationRules.docCode, spec.code), eq(docValidationRules.active, true)))
  const field = (item: CustomsField, target?: string): CustomsField => {
    const store = item.store ?? target
    const required = rules.some((rule) => {
      if (store === "party")
        return rule.target === "party" && rule.field === item.role && item.key === "name"
      const key = rule.field.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
      return rule.target === store && key === item.key
    })
    return { ...item, required: item.required || required }
  }
  const blocks = (items: CustomsBlock[]): CustomsBlock[] =>
    items.map((block) => {
      if (isListBlock(block)) {
        const targets: Record<string, string> = {
          packages: "package",
          containers: "container",
          transports: "transport",
          owners: "party",
        }
        const target = targets[block.list]
        return { ...block, columns: block.columns.map((item) => field(item, target)) }
      }
      return {
        ...block,
        fields: block.fields.map((item) =>
          isFieldGroup(item)
            ? { ...item, fields: item.fields.map((entry) => field(entry)) }
            : field(item),
        ),
      }
    })
  return {
    ...spec,
    tabs: spec.tabs.map((tab) => ({ ...tab, blocks: blocks(tab.blocks) })),
    line: { ...spec.line, blocks: blocks(spec.line.blocks) },
  }
}
