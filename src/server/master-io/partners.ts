import "server-only"

import { asc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { checkbox } from "@/lib/form-fields"
import {
  flagText,
  matchOption,
  optionList,
  parseFlag,
  type ImportColumn,
  type ImportResult,
} from "@/lib/import"
import { digitsOnly } from "@/lib/npwp"
import { IDENTITY_TYPE_LABELS, partnerFieldsSchema } from "@/lib/partner"
import type { Transaction } from "@/server/db/audit"
import { db } from "@/server/db"
import { refCodeStates } from "@/server/db/ref-code-checks"
import { partners } from "@/server/db/schema"
import { writeSpreadsheet, type SpreadsheetFormat } from "@/server/spreadsheet"

import {
  chunks,
  exportColumns,
  INSERT_BATCH_SIZE,
  issueMessages,
  RowErrors,
  type ImportRow,
} from "./common"

// Import/export partner (backlog M1-07). Validasi sama dengan form partner: partnerFieldsSchema
// (termasuk NITKU otomatis dari NPWP) dan pemeriksaan negara serta NITKU yang sama dengan actions.ts.
// Sejak RM-03 kode partner tidak dipakai: baris dicocokkan lewat NPWP (nomor identitas), dan bila
// beberapa partner memakai NPWP yang sama (cabang), lewat NITKU.

export const PARTNER_COLUMNS = [
  {
    key: "identityNumber",
    header: "NPWP",
    aliases: ["Nomor identitas"],
    width: 22,
    required: "always",
    description:
      "NPWP, atau nomor KTP/paspor/lainnya sesuai jenis identitas. NPWP yang sudah ada berarti partner itu diperbarui.",
  },
  {
    key: "nitku",
    header: "NITKU",
    width: 26,
    description: "Untuk NPWP saja. Kosong berarti kantor pusat (NPWP 16 digit + 000000).",
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
    key: "identityType",
    header: "Jenis identitas",
    width: 16,
    required: "new",
    description: `${optionList(IDENTITY_TYPE_LABELS)}.`,
  },
  {
    key: "active",
    header: "Aktif",
    width: 8,
    description: "Ya, atau Tidak untuk mengarsipkan. Kosong berarti Ya.",
  },
] as const satisfies readonly ImportColumn[]

// Kolom yang dihapus di RM-03 (kode dan peran partner); diabaikan saat import file lama.
export const RETIRED_PARTNER_COLUMNS = ["Kode", "Vendor", "Customer"]

type PartnerKey = (typeof PARTNER_COLUMNS)[number]["key"]
type SavedPartner = typeof partners.$inferSelect

function sheetValues(partner: SavedPartner): Record<PartnerKey, string> {
  return {
    identityNumber: partner.identityNumber,
    nitku: partner.nitku ?? "",
    name: partner.name,
    address: partner.address,
    countryCode: partner.countryCode,
    identityType: IDENTITY_TYPE_LABELS[partner.identityType],
    active: flagText(partner.active),
  }
}

export async function exportPartners(format: SpreadsheetFormat) {
  const rows = await db.select().from(partners).orderBy(asc(partners.name), asc(partners.code))
  const values = rows.map((partner) => {
    const sheet = sheetValues(partner)
    return PARTNER_COLUMNS.map((column) => sheet[column.key])
  })
  return writeSpreadsheet(format, "Partner", exportColumns(PARTNER_COLUMNS), values)
}

const rowSchema = z.object({ active: checkbox }).and(partnerFieldsSchema)

type PartnerInput = z.output<typeof rowSchema>

// Bentuk NPWP/nomor identitas yang mungkin tersimpan: angkanya saja (NPWP, KTP), huruf besar
// tanpa spasi (paspor), atau apa adanya (lainnya).
function identityCandidates(value: string) {
  const trimmed = value.trim()
  return [trimmed, digitsOnly(trimmed), trimmed.toUpperCase().replace(/\s/g, "")].filter(Boolean)
}

// Partner tersimpan untuk satu baris: NITKU (bila diisi) memilih cabangnya; tanpa NITKU, NPWP
// harus menunjuk tepat satu partner, atau kantor pusatnya (NITKU berakhiran 000000).
function matchPartner(
  byIdentity: Map<string, SavedPartner[]>,
  identityNumber: string,
  nitku: string,
): { partner?: SavedPartner; error?: string } {
  const found = [
    ...new Map(
      identityCandidates(identityNumber)
        .flatMap((value) => byIdentity.get(value) ?? [])
        .map((partner) => [partner.id, partner]),
    ).values(),
  ]
  const typedNitku = digitsOnly(nitku)
  if (typedNitku) {
    const branch = found.find((partner) => partner.nitku === typedNitku)
    if (branch || found.every((partner) => partner.nitku !== null)) return { partner: branch }
  }
  if (found.length <= 1) return { partner: found[0] }
  const headOffice = found.filter((partner) => partner.nitku?.endsWith("000000"))
  if (headOffice.length === 1) return { partner: headOffice[0] }
  return {
    error: `NPWP ${identityNumber} dipakai ${found.length} partner. Isi kolom NITKU untuk memilih partnernya.`,
  }
}

export async function importPartnerRows(
  tx: Transaction,
  rows: ImportRow<PartnerKey>[],
): Promise<ImportResult> {
  const identities = [
    ...new Set(rows.flatMap((row) => identityCandidates(row.values.identityNumber ?? ""))),
  ]
  const countries = [
    ...new Set(rows.map((row) => row.values.countryCode?.toUpperCase()).filter(Boolean)),
  ] as string[]
  // Berurutan: query di satu transaksi memakai satu koneksi, jadi tidak bisa paralel.
  const savedRows = identities.length
    ? await tx.select().from(partners).where(inArray(partners.identityNumber, identities))
    : []
  const countryStates = await refCodeStates(tx, "country", countries)
  const byIdentity = Map.groupBy(savedRows, (partner) => partner.identityNumber)

  // Tahap 1: periksa setiap baris sendiri-sendiri.
  const checked: {
    row: ImportRow<PartnerKey>
    messages: string[]
    current?: SavedPartner
    data?: PartnerInput
    repeated?: boolean
  }[] = []
  // Partner yang sama (tersimpan, atau NPWP + NITKU yang sama untuk partner baru) dua kali.
  const seen = new Map<string, number>()
  for (const row of rows) {
    const identityNumber = row.values.identityNumber ?? ""
    const messages: string[] = []
    const reported = new Set<string>()
    const match = matchPartner(byIdentity, identityNumber, row.values.nitku ?? "")
    if (match.error) messages.push(match.error)
    const current = match.partner
    const sheet = { ...(current && sheetValues(current)), ...row.values }

    const key =
      current?.id ?? `${digitsOnly(identityNumber) || identityNumber}|${row.values.nitku ?? ""}`
    const first = seen.get(key)
    if (first !== undefined) messages.push(`NPWP ${identityNumber} sudah ada di baris ${first}.`)
    else seen.set(key, row.line)
    const repeated = first !== undefined

    const active = parseFlag(sheet.active ?? "", true)
    if (active === undefined) messages.push("Aktif harus Ya atau Tidak.")
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
      active: active ? "on" : undefined,
      countryCode: sheet.countryCode?.toUpperCase(),
      identityType: identityType || undefined,
    })
    if (!parsed.success) messages.push(...issueMessages(parsed.error, reported))
    // Diperiksa walaupun field lain gagal, supaya semua kesalahan baris ini tampil sekaligus.
    const countryCode = sheet.countryCode?.toUpperCase()
    if (countryCode && countryCode !== current?.countryCode && !countryStates.get(countryCode)) {
      messages.push(`Negara dengan kode ${countryCode} tidak ditemukan.`)
    }
    checked.push({
      row,
      messages,
      current,
      repeated,
      data: parsed.success ? parsed.data : undefined,
    })
  }

  // Tahap 2: NITKU unik, baik di antara baris file maupun terhadap partner lain di database.
  const nitkus = [...new Set(checked.map(({ data }) => data?.nitku).filter(Boolean))] as string[]
  const nitkuOwners = new Map(
    nitkus.length
      ? (
          await tx
            .select({ id: partners.id, name: partners.name, nitku: partners.nitku })
            .from(partners)
            .where(inArray(partners.nitku, nitkus))
        ).map((row) => [row.nitku!, row])
      : [],
  )
  const nitkuInFile = new Map<string, number>()
  for (const { row, data, messages, current, repeated } of checked) {
    if (!data?.nitku || repeated) continue
    const owner = nitkuOwners.get(data.nitku)
    const earlier = nitkuInFile.get(data.nitku)
    if (owner && owner.id !== current?.id) {
      messages.push(`NITKU ${data.nitku} sudah dipakai partner ${owner.name}.`)
    } else if (earlier !== undefined) {
      messages.push(`NITKU ${data.nitku} juga dipakai di baris ${earlier}.`)
    }
    nitkuInFile.set(data.nitku, row.line)
  }

  const errors = new RowErrors()
  const creates: PartnerInput[] = []
  const updates: { id: string; values: PartnerInput }[] = []
  let unchanged = 0
  for (const { row, messages, data, current } of checked) {
    if (messages.length || !data) {
      errors.add(row.line, row.values.identityNumber ?? "", messages)
      continue
    }
    if (!current) {
      creates.push(data)
      continue
    }
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
    saved.identityType !== values.identityType ||
    saved.identityNumber !== values.identityNumber ||
    saved.nitku !== values.nitku ||
    saved.active !== values.active
  )
}
