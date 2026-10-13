import "server-only"

import { asc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { checkbox, requiredText } from "@/lib/form-fields"
import {
  flagText,
  matchOption,
  optionList,
  parseFlag,
  type ImportColumn,
  type ImportResult,
} from "@/lib/import"
import { IDENTITY_TYPE_LABELS, partnerFieldsSchema } from "@/lib/partner"
import type { Transaction } from "@/server/db/audit"
import { db } from "@/server/db"
import { refCodeStates } from "@/server/db/ref-code-checks"
import { partners } from "@/server/db/schema"
import { writeSpreadsheet, type SpreadsheetFormat } from "@/server/spreadsheet"

import {
  chunks,
  DuplicateKeys,
  exportColumns,
  INSERT_BATCH_SIZE,
  issueMessages,
  RowErrors,
  type ImportRow,
} from "./common"

// Import/export partner (backlog M1-07). Validasi sama dengan form partner: partnerFieldsSchema
// (termasuk NITKU otomatis dari NPWP) dan pemeriksaan negara serta NITKU yang sama dengan actions.ts.

export const PARTNER_COLUMNS = [
  {
    key: "code",
    header: "Kode",
    width: 14,
    required: "always",
    description: "Kode unik partner. Kode yang sudah ada berarti partner itu diperbarui.",
  },
  { key: "name", header: "Nama", width: 36, required: "new", description: "Nama partner." },
  { key: "address", header: "Alamat", width: 48, required: "new", description: "Alamat lengkap." },
  {
    key: "countryCode",
    header: "Negara",
    width: 10,
    required: "new",
    description: "Kode negara 2 huruf, misalnya ID atau JP.",
  },
  {
    key: "isVendor",
    header: "Vendor",
    width: 10,
    description: "Ya atau Tidak. Minimal salah satu dari Vendor dan Customer berisi Ya.",
  },
  { key: "isCustomer", header: "Customer", width: 10, description: "Ya atau Tidak." },
  {
    key: "identityType",
    header: "Jenis identitas",
    width: 16,
    required: "new",
    description: `${optionList(IDENTITY_TYPE_LABELS)}.`,
  },
  {
    key: "identityNumber",
    header: "Nomor identitas",
    width: 22,
    required: "new",
    description: "NPWP dan KTP boleh memakai titik dan strip.",
  },
  {
    key: "nitku",
    header: "NITKU",
    width: 26,
    description: "Untuk NPWP saja. Kosong berarti kantor pusat (NPWP 16 digit + 000000).",
  },
  {
    key: "active",
    header: "Aktif",
    width: 8,
    description: "Ya, atau Tidak untuk mengarsipkan. Kosong berarti Ya.",
  },
] as const satisfies readonly ImportColumn[]

type PartnerKey = (typeof PARTNER_COLUMNS)[number]["key"]
type SavedPartner = typeof partners.$inferSelect

function sheetValues(partner: SavedPartner): Record<PartnerKey, string> {
  return {
    code: partner.code,
    name: partner.name,
    address: partner.address,
    countryCode: partner.countryCode,
    isVendor: flagText(partner.isVendor),
    isCustomer: flagText(partner.isCustomer),
    identityType: IDENTITY_TYPE_LABELS[partner.identityType],
    identityNumber: partner.identityNumber,
    nitku: partner.nitku ?? "",
    active: flagText(partner.active),
  }
}

export async function exportPartners(format: SpreadsheetFormat) {
  const rows = await db.select().from(partners).orderBy(asc(partners.code))
  const values = rows.map((partner) => {
    const sheet = sheetValues(partner)
    return PARTNER_COLUMNS.map((column) => sheet[column.key])
  })
  return writeSpreadsheet(format, "Partner", exportColumns(PARTNER_COLUMNS), values)
}

const rowSchema = z
  .object({ code: requiredText("Kode partner", 30), active: checkbox })
  .and(partnerFieldsSchema)

type PartnerInput = z.output<typeof rowSchema>

const FLAGS = [
  { key: "isVendor", label: "Vendor", blank: false },
  { key: "isCustomer", label: "Customer", blank: false },
  { key: "active", label: "Aktif", blank: true },
] as const

export async function importPartnerRows(
  tx: Transaction,
  rows: ImportRow<PartnerKey>[],
): Promise<ImportResult> {
  const codes = [...new Set(rows.map((row) => row.values.code).filter(Boolean))] as string[]
  const countries = [
    ...new Set(rows.map((row) => row.values.countryCode?.toUpperCase()).filter(Boolean)),
  ] as string[]
  // Berurutan: query di satu transaksi memakai satu koneksi, jadi tidak bisa paralel.
  const savedRows = codes.length
    ? await tx.select().from(partners).where(inArray(partners.code, codes))
    : []
  const countryStates = await refCodeStates(tx, "country", countries)
  const saved = new Map(savedRows.map((partner) => [partner.code, partner]))

  // Tahap 1: periksa setiap baris sendiri-sendiri.
  const checked: { row: ImportRow<PartnerKey>; messages: string[]; data?: PartnerInput }[] = []
  const duplicates = new DuplicateKeys()
  for (const row of rows) {
    const code = row.values.code ?? ""
    const current = saved.get(code)
    const sheet = { ...(current && sheetValues(current)), ...row.values }
    const messages: string[] = []
    const reported = new Set<string>()

    const duplicate = duplicates.check(code, row.line, "Kode partner")
    if (duplicate) messages.push(duplicate)

    const flags: Record<string, "on" | undefined> = {}
    for (const flag of FLAGS) {
      const value = parseFlag(sheet[flag.key] ?? "", flag.blank)
      if (value === undefined) messages.push(`${flag.label} harus Ya atau Tidak.`)
      flags[flag.key] = value ? "on" : undefined
    }
    const identityType = sheet.identityType
      ? matchOption(sheet.identityType, IDENTITY_TYPE_LABELS)
      : ""
    if (identityType === undefined) {
      reported.add("identityType")
      messages.push(
        `Jenis identitas "${sheet.identityType}" tidak dikenal. Pilih ${optionList(IDENTITY_TYPE_LABELS)}.`,
      )
    }

    const parsed = rowSchema.safeParse({
      ...sheet,
      ...flags,
      countryCode: sheet.countryCode?.toUpperCase(),
      identityType: identityType || undefined,
    })
    if (!parsed.success) messages.push(...issueMessages(parsed.error, reported))
    // Diperiksa walaupun field lain gagal, supaya semua kesalahan baris ini tampil sekaligus.
    const countryCode = sheet.countryCode?.toUpperCase()
    if (countryCode && countryCode !== current?.countryCode && !countryStates.get(countryCode)) {
      messages.push(`Negara dengan kode ${countryCode} tidak ditemukan.`)
    }
    checked.push({ row, messages, data: parsed.success ? parsed.data : undefined })
  }

  // Tahap 2: NITKU unik, baik di antara baris file maupun terhadap partner lain di database.
  const nitkus = [...new Set(checked.map(({ data }) => data?.nitku).filter(Boolean))] as string[]
  const nitkuOwners = new Map(
    nitkus.length
      ? (
          await tx
            .select({ code: partners.code, nitku: partners.nitku })
            .from(partners)
            .where(inArray(partners.nitku, nitkus))
        ).map((row) => [row.nitku!, row.code])
      : [],
  )
  const nitkuInFile = new Map<string, string>()
  for (const { data, messages } of checked) {
    if (!data?.nitku) continue
    const owner = nitkuOwners.get(data.nitku)
    const earlier = nitkuInFile.get(data.nitku)
    if (owner && owner !== data.code) {
      messages.push(`NITKU ${data.nitku} sudah dipakai partner ${owner}.`)
    } else if (earlier && earlier !== data.code) {
      messages.push(`NITKU ${data.nitku} juga dipakai partner ${earlier} di file ini.`)
    }
    nitkuInFile.set(data.nitku, data.code)
  }

  const errors = new RowErrors()
  const creates: PartnerInput[] = []
  const updates: { id: string; values: PartnerInput }[] = []
  let unchanged = 0
  for (const { row, messages, data } of checked) {
    if (messages.length || !data) {
      errors.add(row.line, row.values.code ?? "", messages)
      continue
    }
    const current = saved.get(data.code)
    if (!current) {
      creates.push(data)
      continue
    }
    // Kode ikut di-set dengan nilai yang sama; trigger partners_guard hanya menolak perubahan.
    if (changed(current, data)) updates.push({ id: current.id, values: data })
    else unchanged++
  }
  if (errors.count) return errors.result(rows.length)

  for (const batch of chunks(creates, INSERT_BATCH_SIZE)) await tx.insert(partners).values(batch)
  for (const { id, values } of updates) {
    await tx.update(partners).set(values).where(eq(partners.id, id))
  }
  return {
    status: "imported",
    total: rows.length,
    created: creates.length,
    updated: updates.length,
    unchanged,
  }
}

function changed(saved: SavedPartner, values: PartnerInput) {
  return (
    saved.name !== values.name ||
    saved.address !== values.address ||
    saved.countryCode !== values.countryCode ||
    saved.isVendor !== values.isVendor ||
    saved.isCustomer !== values.isCustomer ||
    saved.identityType !== values.identityType ||
    saved.identityNumber !== values.identityNumber ||
    saved.nitku !== values.nitku ||
    saved.active !== values.active
  )
}
